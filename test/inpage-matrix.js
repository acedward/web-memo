/*
 * inpage-matrix.js — the Read tamper matrix, executed INSIDE the page.
 *
 * This file is evaluated verbatim in a real browser by `test/read-matrix.mjs`.
 * It drives `window.__WEBMEMO_READ__`, which is the same entry point the
 * page's own buttons call — so a passing matrix is evidence about the shipped
 * page, not about a parallel copy of the pipeline.
 *
 * Every tampered artifact is built here, at test time, from the frozen
 * fixtures, using the page's own WebAssembly module. Nothing tampered is
 * committed: a committed "bad wrapper" is a bad wrapper someone has to trust
 * the provenance of, whereas a wrapper this file flips one bit in is a wrapper
 * whose defect is visible in the source.
 */
(async () => {
    const R = { checks: [], info: {}, error: null };
    const api = window.__WEBMEMO_READ__;
    const m = api.wasm;

    const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    const unhex = (s) => Uint8Array.from(s.match(/../g) || [], (b) => parseInt(b, 16));

    function check(id, what, pass, detail) {
        R.checks.push({ id, what, pass: !!pass, detail: typeof detail === 'string' ? detail.slice(0, 400) : '' });
    }

    async function fx(name) {
        const res = await fetch(`fixtures/${name}`);
        if (!res.ok) throw new Error(`fixture ${name}: HTTP ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
    }

    /** Load an offer file plus zero or more wrappers, from bytes already in the page. */
    function load(offerBytes, wrappers, labels = []) {
        api.clear();
        let s = api.addBytes(offerBytes, labels[0] || 'offer');
        wrappers.forEach((w, i) => { s = api.addBytes(w, labels[i + 1] || `wrapper-${i + 1}`); });
        return s;
    }

    const item0 = (s) => (s.items && s.items[0]) || {};

    try {
        // -------------------------------------------------------------- setup
        const refTx = await fx('reference.offer-tx.bin');
        const refBare = await fx('reference.offer-bare.bin');
        const refWrap = await fx('reference.wrapper.bin');
        const othTx = await fx('unrelated.offer-tx.bin');
        const othWrap = await fx('unrelated.wrapper.bin');
        const hostileTx = await fx('hostile-memo.offer-tx.bin');
        const hostileWrap = await fx('hostile-memo.wrapper.bin');
        const multiTx = await fx('two-inputs-same-memo.offer-tx.bin');
        const multiW1 = await fx('two-inputs-same-memo-1.wrapper.bin');
        const multiW2 = await fx('two-inputs-same-memo-2.wrapper.bin');
        const noAnchorTx = await fx('no-anchor.offer-tx.bin');
        const guarTx = await fx('guaranteed-segment.offer-tx.bin');
        const guarWrap = await fx('guaranteed-segment.wrapper.bin');

        const parsedRef = m.memoWrapperParse(refWrap);
        const rebuild = (o) => m.memoWrapperBuild(
            o.memo ?? parsedRef.unverifiedMemo,
            o.nullifier ?? parsedRef.nullifier,
            o.segment ?? parsedRef.segment,
            o.tail ?? parsedRef.claimedStatementTail,
            o.proof ?? parsedRef.companionProof,
            o.locator === undefined ? parsedRef.untrustedLocator : o.locator,
        );

        const HELLO = '68656c6c6f20776f726c64';
        const HELLO_H = '65d3c33a0fb14d48a042620c375bb19fba0f9d8fbfc6bbe3f21959f73c2a5455';

        // Baseline DOM census, for the FR-018 "nothing was injected" check.
        const census = () => ({
            script: document.querySelectorAll('script').length,
            img: document.querySelectorAll('img').length,
            iframe: document.querySelectorAll('iframe').length,
            anchors: document.querySelectorAll('a').length,
            objects: document.querySelectorAll('object,embed,svg,form,input[type=password]').length,
        });
        const before = census();
        R.info.domCensusBefore = before;

        // ======================================================= V — valid pair
        {
            const s = load(refTx, [refWrap], ['reference.offer-tx.bin', 'reference.wrapper.bin']);
            const it = item0(s);
            check('V1', 'a valid pair reaches AuthenticatedWithMatchingAnchorUnconfirmed',
                s.items.length === 1 && it.state === 'AuthenticatedWithMatchingAnchorUnconfirmed' && it.authenticated === true,
                `${s.items.length} item(s), state=${it.state}`);
            check('V2', 'the authenticated memo is exactly the expected bytes', it.memoHex === HELLO, `memo=${it.memoHex}`);
            check('V3', "the memo-hash is 00003's frozen ascii-hello-world vector", it.h === HELLO_H, `h=${it.h}`);
            check('V4', 'exactly one memo is rendered, and it reads "hello world"',
                s.renderedMemoCount === 1 && s.renderedMemoText[0] === 'hello world',
                `${s.renderedMemoCount} rendered: ${JSON.stringify(s.renderedMemoText)}`);
            check('V5', 'the offer file was parsed as a transaction with one fallible offer at segment 3',
                s.offerFile && s.offerFile.offers.length === 1 && s.offerFile.offers[0].segment === 3 && s.offerFile.offers[0].slot === 'fallible',
                JSON.stringify(s.offerFile && s.offerFile.offers));
            check('V6', 'the page never claims settlement',
                !/\bSETTLED\b/i.test(s.pageText) || /cannot reach|needs chain evidence/i.test(s.pageText),
                'settlement wording checked');
            R.info.validPair = it;
        }

        // ===================================================== M — memo tamper
        {
            const flipped = Uint8Array.from(parsedRef.unverifiedMemo);
            flipped[0] ^= 0x01;                       // "hello world" -> "iello world"
            const s = load(refTx, [rebuild({ memo: flipped })]);
            const it = item0(s);
            check('M1', 'a one-bit memo flip fails closed with a typed reason',
                it.state === 'MalformedOrUntrusted' && it.failure && it.failure.code === 'VERIFY_FAILED',
                `${it.state} / ${it.failure && it.failure.message}`);
            check('M2', 'the verifier names the rule that failed',
                it.failure && /does not bind this memo/i.test(it.failure.message),
                it.failure && it.failure.message);
            check('M3', 'NO memo is rendered as authenticated', s.renderedMemoCount === 0, `${s.renderedMemoCount} rendered`);
            check('M4', 'the tampered memo text does not appear anywhere in the report',
                !s.pageText.includes('iello world'), 'report text scanned');
        }
        {
            // A memo of a different length, so the whole section is resized.
            const s = load(refTx, [rebuild({ memo: new TextEncoder().encode('hello world!!') })]);
            const it = item0(s);
            check('M5', 'a lengthened memo also fails closed',
                it.state === 'MalformedOrUntrusted' && s.renderedMemoCount === 0,
                `${it.state}, ${s.renderedMemoCount} memo(s) rendered`);
        }

        // ==================================================== G — proof grafts
        {
            const other = m.memoWrapperParse(othWrap);
            const s = load(refTx, [rebuild({ proof: other.companionProof })]);
            const it = item0(s);
            check('G1', 'a READABLE companion proof from an unrelated offer is refused',
                it.state === 'MalformedOrUntrusted' && it.failure.code === 'VERIFY_FAILED' && s.renderedMemoCount === 0,
                it.failure && it.failure.message);
        }
        {
            const s = load(refTx, [rebuild({ proof: new Uint8Array(64).fill(0xff) })]);
            const it = item0(s);
            check('G2', 'unreadable proof bytes are a typed refusal, not a crash',
                it.state === 'MalformedOrUntrusted' && /not readable/i.test(it.failure.message),
                it.failure && it.failure.message);
        }
        {
            const spendProof = m.ZswapOffer.deserialize('proof', refBare).inputs[0].proof.serialize();
            const s = load(refTx, [rebuild({ proof: spendProof })]);
            const it = item0(s);
            check('G3', "the offer's own SPEND proof cannot stand in for the companion",
                it.state === 'MalformedOrUntrusted' && s.renderedMemoCount === 0,
                it.failure && it.failure.message);
        }
        {
            const tail = Uint8Array.from(parsedRef.claimedStatementTail);
            tail[12 * 32] ^= 0x01;
            const s = load(refTx, [rebuild({ tail })]);
            const it = item0(s);
            check('G4', "a perturbed statement row is caught by the verifier's own rebuild",
                it.state === 'MalformedOrUntrusted' && /statement row/i.test(it.failure.message),
                it.failure && it.failure.message);
        }

        // ======================================================= P — pairing
        {
            const s = load(othTx, [refWrap]);
            const it = item0(s);
            check('P1', 'a wrapper paired with an unrelated offer file is refused',
                it.state === 'MalformedOrUntrusted' && /no input with nullifier/i.test(it.failure.message) && s.renderedMemoCount === 0,
                it.failure && it.failure.message);
        }
        {
            const s = load(refTx, [rebuild({ segment: parsedRef.segment + 1 })]);
            const it = item0(s);
            check('P2', 'a wrapper bound to a segment the transaction does not carry is refused before any proof work',
                it.state === 'MalformedOrUntrusted' && it.failure.code === 'SEGMENT_NOT_IN_TRANSACTION',
                it.failure && it.failure.message);
        }
        {
            const s = load(refTx, [rebuild({ nullifier: new Uint8Array(32).fill(0x11) })]);
            const it = item0(s);
            check('P3', 'a re-attributed nullifier is refused',
                it.state === 'MalformedOrUntrusted' && /no input with nullifier/i.test(it.failure.message),
                it.failure && it.failure.message);
        }
        {
            // Both artifacts valid, both from the same construction, but crossed.
            const s = load(refTx, [othWrap]);
            const it = item0(s);
            check('P4', 'crossing two VALID pairs is a mismatch, not a pass',
                it.state === 'MalformedOrUntrusted' && s.renderedMemoCount === 0, it.failure && it.failure.message);
        }

        // ======================================================= A — anchors
        {
            const s = load(refTx, []);
            const it = item0(s);
            check('A1', 'an anchor with no wrapper reports CommittedButMissing',
                s.items.length === 1 && it.state === 'CommittedButMissing' && it.authenticated === false,
                `${it.state}`);
            check('A2', 'CommittedButMissing shows the commitment and NO memo',
                it.h === HELLO_H && s.renderedMemoCount === 0, `h=${it.h}, ${s.renderedMemoCount} memo(s)`);
        }
        {
            const s = load(noAnchorTx, []);
            const it = item0(s);
            check('A3', 'an offer file with no anchor and no wrapper reports NoEvidence',
                s.items.length === 1 && it.state === 'NoEvidence' && s.renderedMemoCount === 0, `${it.state}`);
        }
        {
            const s = load(multiTx, [multiW1, multiW2]);
            const auth = s.items.filter((i) => i.state === 'AuthenticatedWithMatchingAnchorUnconfirmed');
            const hs = new Set(auth.map((i) => i.h));
            const ns = new Set(auth.map((i) => i.nullifier));
            check('A4', 'two inputs carrying the IDENTICAL memo both authenticate',
                s.items.length === 2 && auth.length === 2, `${s.items.length} items, ${auth.length} authenticated`);
            check('A5', 'the two share one memo-hash but are attributed to DIFFERENT inputs',
                hs.size === 1 && ns.size === 2, `h:${[...hs]} nullifiers:${[...ns].map((n) => n.slice(0, 12))}`);
            check('A6', 'both memos are rendered, each on its own input',
                s.renderedMemoCount === 2 && s.renderedMemoText.every((t) => t === 'one memo, two inputs'),
                JSON.stringify(s.renderedMemoText));
        }
        {
            const s = load(multiTx, [multiW1]);
            const auth = s.items.filter((i) => i.authenticated);
            const missing = s.items.filter((i) => i.state === 'CommittedButMissing');
            check('A7', 'supplying only ONE of two wrappers authenticates one input and reports the other as CommittedButMissing',
                auth.length === 1 && missing.length === 1 && s.renderedMemoCount === 1,
                `${auth.length} authenticated, ${missing.length} committed-but-missing`);
        }
        {
            const s = load(guarTx, [guarWrap]);
            const it = item0(s);
            check('A8', 'a memo on the GUARANTEED segment (0) authenticates through tx.guaranteedOffer',
                it.state === 'AuthenticatedWithMatchingAnchorUnconfirmed' && s.offerFile.offers[0].slot === 'guaranteed',
                `${it.state}, slot=${s.offerFile.offers[0].slot}`);
        }

        // ===================================================== B — bad inputs
        const bad = (id, what, fn, expectCode, extra) => {
            api.clear();
            const t0 = performance.now();
            let s;
            try { s = fn(); } catch (e) { s = { error: { code: 'THREW', message: String(e.message || e) } }; }
            const dt = performance.now() - t0;
            const code = (s.error && s.error.code) || (s.reportError && s.reportError.code) || null;
            const itemFailure = s.items && s.items.length ? `${item0(s).state}/${item0(s).failure ? item0(s).failure.code : '-'}: ${item0(s).failure ? item0(s).failure.message : ''}` : '';
            const why = (s.error && s.error.message) || (s.reportError && s.reportError.message) || itemFailure || '';
            check(id, what, code === expectCode && (!extra || extra(s, dt)), `code=${code ?? item0(s).failure?.code ?? '-'} in ${dt.toFixed(1)} ms — ${why}`);
            return dt;
        };

        bad('B1', 'bare tagged Offer bytes are refused as "not an offer file"',
            () => api.addBytes(refBare, 'reference.offer-bare.bin'), 'BARE_OFFER_NOT_AN_OFFER_FILE');
        bad('B2', 'random bytes are refused with an unknown-magic error',
            () => api.addBytes(new Uint8Array(500).fill(0xab), 'junk'), 'UNKNOWN_MAGIC');
        bad('B3', 'a 12-byte input is refused as too small',
            () => api.addBytes(new Uint8Array(12), 'tiny'), 'TOO_SMALL');
        const overBytesMs = bad('B4', 'an oversize artifact is refused BEFORE any parse',
            () => api.addBytes(new Uint8Array(9 * 1024 * 1024), 'huge'), 'TOO_LARGE',
            (_s, dt) => dt < 250);
        R.info.oversizeBytesMs = overBytesMs;
        const overTextMs = bad('B5', 'an oversize paste is refused BEFORE any decode',
            () => api.addText(`swapoffer1${'q'.repeat(14 * 1024 * 1024)}`, 'huge paste'), 'TOO_LARGE',
            (_s, dt) => dt < 500);
        R.info.oversizeTextMs = overTextMs;
        bad('B6', 'text with no bech32m separator is refused',
            () => api.addText('this is definitely not an artifact', 'prose'), 'NOT_BECH32M');
        bad('B7', 'a foreign bech32m prefix is refused by name',
            () => api.addText(m.memoWrapperToBech32m(refWrap, 'bc'), 'foreign hrp'), 'WRONG_HRP');
        bad('B8', 'a single altered character is caught by the bech32m checksum', () => {
            const s = m.memoWrapperToBech32m(refWrap);
            const i = s.length - 25;
            return api.addText(s.slice(0, i) + (s[i] === 'q' ? 'p' : 'q') + s.slice(i + 1), 'corrupt bech32m');
        }, 'BAD_CHECKSUM');
        bad('B9', 'a string LABELLED swapoffer whose bytes are a wrapper is refused as a mismatch',
            () => api.addText(m.memoWrapperToBech32m(refWrap, 'swapoffer'), 'mislabelled'), 'SWAPPED_ARTIFACTS');
        bad('B10', 'a truncated offer file is refused with the ledger\'s own reason',
            () => api.addBytes(refTx.slice(0, 4000), 'truncated tx'), 'TRUNCATED');
        bad('B11', 'a truncated wrapper is refused', () => {
            api.addBytes(refTx, 'offer');
            return api.addBytes(refWrap.slice(0, 200), 'truncated wrapper');
        }, null, (s) => {
            const it = item0(s);
            return it.state === 'MalformedOrUntrusted' && ['TRUNCATED', 'PARSE_FAILED'].includes(it.failure.code) && s.renderedMemoCount === 0;
        });
        bad('B12', 'an empty paste says so', () => api.addText('   ', 'empty'), 'EMPTY_INPUT');
        {
            // A wrapper dropped in on its own: routed correctly, and the page
            // says what is missing instead of failing obscurely.
            api.clear();
            const s = api.addBytes(refWrap, 'reference.wrapper.bin');
            check('B13', 'a wrapper with no offer file is accepted, routed, and reported as incomplete',
                s.reportError && s.reportError.code === 'EMPTY_INPUT' && /offer file/i.test(s.reportError.message),
                s.reportError && s.reportError.message);
        }
        {
            api.clear();
            api.addBytes(refTx, 'offer');
            const s = api.addBytes(refWrap, 'w1');
            const s2 = api.addBytes(refWrap, 'w1 again');
            check('B14', 'the same wrapper twice is refused as a duplicate',
                s.items.length === 1 && s2.error && s2.error.code === 'DUPLICATE_ARTIFACT',
                s2.error && s2.error.message);
        }

        // =========================== W — the wrapper container's own rules
        // Task 2.2 requires unknown OPTIONAL sections (tag > 0x0fff) to be
        // tolerated and unknown MANDATORY ones (tag <= 0x0fff) to be refused.
        // Those rules live in the 00003 codec; these checks prove the page
        // inherits them rather than quietly reimplementing them.
        //
        // Layout (00003 wrapper.rs): magic(27) version(u16 LE) count(u16 LE)
        // then count x { tag(u16 LE) len(u32 LE) payload }, in ascending tag
        // order, exactly consumed.
        {
            const MAGIC_LEN = 27;
            const readSections = (bytes) => {
                const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                const count = dv.getUint16(MAGIC_LEN + 2, true);
                const out = [];
                let off = MAGIC_LEN + 4;
                for (let i = 0; i < count; i++) {
                    const tag = dv.getUint16(off, true);
                    const len = dv.getUint32(off + 2, true);
                    out.push({ tag, payload: bytes.slice(off + 6, off + 6 + len) });
                    off += 6 + len;
                }
                return out;
            };
            const writeSections = (bytes, sections, { version = 1, count = null, trailing = null } = {}) => {
                let total = MAGIC_LEN + 4 + sections.reduce((a, x) => a + 6 + x.payload.length, 0);
                if (trailing) total += trailing.length;
                const out = new Uint8Array(total);
                out.set(bytes.slice(0, MAGIC_LEN), 0);
                const dv = new DataView(out.buffer);
                dv.setUint16(MAGIC_LEN, version, true);
                dv.setUint16(MAGIC_LEN + 2, count === null ? sections.length : count, true);
                let off = MAGIC_LEN + 4;
                for (const s of sections) {
                    dv.setUint16(off, s.tag, true);
                    dv.setUint32(off + 2, s.payload.length, true);
                    out.set(s.payload, off + 6);
                    off += 6 + s.payload.length;
                }
                if (trailing) out.set(trailing, off);
                return out;
            };

            const sections = readSections(refWrap);
            R.info.wrapperSectionTags = sections.map((x) => x.tag);
            check('W0', 'the reference wrapper round-trips through the test splicer unchanged',
                hex(writeSections(refWrap, sections)) === hex(refWrap),
                `tags ${sections.map((x) => '0x' + x.tag.toString(16)).join(',')}`);

            {
                // Unknown OPTIONAL section, appended after the locator (0x1001).
                const spliced = writeSections(refWrap, [...sections, { tag: 0x2000, payload: new TextEncoder().encode('a future optional section') }]);
                const s = load(refTx, [spliced]);
                const it = item0(s);
                check('W1', 'an unknown OPTIONAL section (tag > 0x0fff) is ignored and the memo still authenticates',
                    it.state === 'AuthenticatedWithMatchingAnchorUnconfirmed' && it.memoHex === HELLO,
                    `${it.state}`);
            }
            {
                // Unknown MANDATORY section, in order between 0x0005 and 0x1001.
                const withMandatory = [...sections];
                withMandatory.splice(5, 0, { tag: 0x0006, payload: new Uint8Array([1, 2, 3]) });
                const s = load(refTx, [writeSections(refWrap, withMandatory)]);
                const it = item0(s);
                check('W2', 'an unknown MANDATORY section (tag <= 0x0fff) is refused',
                    it.state === 'MalformedOrUntrusted' && /mandatory/i.test(it.failure.message) && s.renderedMemoCount === 0,
                    it.failure && it.failure.message);
            }
            {
                const s = load(refTx, [writeSections(refWrap, [...sections, sections[0]])]);
                const it = item0(s);
                check('W3', 'a duplicated section is refused',
                    it.state === 'MalformedOrUntrusted' && /more than once|duplicate/i.test(it.failure.message), it.failure && it.failure.message);
            }
            {
                const reordered = [sections[1], sections[0], ...sections.slice(2)];
                const s = load(refTx, [writeSections(refWrap, reordered)]);
                const it = item0(s);
                check('W4', 'sections out of ascending tag order are refused',
                    it.state === 'MalformedOrUntrusted' && /must ascend|out of order/i.test(it.failure.message), it.failure && it.failure.message);
            }
            {
                const s = load(refTx, [writeSections(refWrap, sections, { trailing: new Uint8Array([9, 9, 9]) })]);
                const it = item0(s);
                check('W5', 'trailing bytes after the last section are refused',
                    it.state === 'MalformedOrUntrusted' && /trailing/i.test(it.failure.message), it.failure && it.failure.message);
            }
            {
                const s = load(refTx, [writeSections(refWrap, sections, { version: 2 })]);
                const it = item0(s);
                check('W6', 'a wrapper claiming version 2 is refused by a version 1 reader',
                    it.state === 'MalformedOrUntrusted' && /version/i.test(it.failure.message), it.failure && it.failure.message);
            }
            {
                // A declared section length of u32::MAX must be a typed error,
                // not a four-gigabyte allocation.
                const bomb = writeSections(refWrap, sections);
                new DataView(bomb.buffer).setUint32(MAGIC_LEN + 4 + 2, 0xffffffff, true);
                const t0 = performance.now();
                const s = load(refTx, [bomb]);
                const dt = performance.now() - t0;
                const it = item0(s);
                check('W7', 'a section declaring 4 GiB is a typed error, refused in milliseconds',
                    it.state === 'MalformedOrUntrusted' && dt < 250, `${it.failure && it.failure.message} in ${dt.toFixed(1)} ms`);
            }
        }

        // ============================================ H — hostile memo (FR-018)
        {
            const s = load(hostileTx, [hostileWrap]);
            const it = item0(s);
            check('H1', 'a hostile memo AUTHENTICATES — the format does not judge content',
                it.state === 'AuthenticatedWithMatchingAnchorUnconfirmed' && it.memoLength === 148,
                `${it.state}, ${it.memoLength} bytes`);

            const body = document.querySelector('.memo:not(.unverified) .memo-body');
            const text = body ? body.textContent : '';
            const html = body ? body.innerHTML : '';
            R.info.hostileRenderedText = text;
            R.info.hostileRenderedHtml = html.slice(0, 600);

            check('H2', 'the script tag is TEXT, not markup',
                text.includes("<script>alert('xss')</script>") && html.includes('&lt;script&gt;') && !/<script/i.test(html),
                html.slice(0, 120));
            check('H3', 'the img/onerror payload is text too',
                text.includes('<img src=x onerror=alert(1)>') && html.includes('&lt;img') && !/<img/i.test(html),
                'checked');
            check('H4', 'the ANSI escape is shown escaped, never emitted',
                text.includes('\\u{001b}[31m') && !text.includes(''), 'ESC escaped');
            check('H5', 'the right-to-left override is shown escaped',
                text.includes('\\u{202e}') && !text.includes('‮'), 'U+202E escaped');
            check('H6', 'the zero-width space is shown escaped',
                text.includes('\\u{200b}') && !text.includes('​'), 'U+200B escaped');
            check('H7', 'NUL and BEL are shown escaped',
                text.includes('\\u{0000}') && text.includes('\\u{0007}') && !text.includes(' '), 'C0 escaped');
            check('H8', 'an already-escaped entity is NOT double-decoded',
                text.includes('&lt;already-escaped&gt;'), 'entity left alone');
            check('H9', 'the byte length is stated',
                document.querySelector('.memo .memo-head').textContent.includes('148 bytes'),
                document.querySelector('.memo .memo-head').textContent);

            const after = census();
            R.info.domCensusAfter = after;
            check('H10', 'rendering the hostile memo injected NO elements at all',
                after.script === before.script && after.img === before.img && after.iframe === before.iframe
                && after.anchors === before.anchors && after.objects === before.objects,
                JSON.stringify({ before, after }));

            // The hex view must show the same bytes with no interpretation.
            const hexBtn = Array.from(document.querySelectorAll('.memo .toggle')).find((b) => b.textContent === 'Hex');
            hexBtn.click();
            const dump = document.querySelector('.memo .memo-body').textContent;
            const dumpHex = dump.split('\n').map((l) => l.slice(10, 60).replace(/\s+/g, '')).join('');
            check('H11', 'the hex view reproduces the memo bytes exactly',
                dumpHex === hex(unhex(it.memoHex)), `${dumpHex.length / 2} bytes vs ${it.memoLength}`);

            const asciiBtn = Array.from(document.querySelectorAll('.memo .toggle')).find((b) => b.textContent === 'Strict ASCII');
            asciiBtn.click();
            const ascii = document.querySelector('.memo .memo-body').textContent;
            check('H12', 'the strict-ASCII view contains only printable ASCII',
                /^[\x20-\x7e]*$/.test(ascii) && ascii.includes('\\x1b'), `${ascii.length} chars`);
        }

        // ============================================== C — the control
        {
            const s = load(refTx, [refWrap]);
            const it = item0(s);
            check('C1', 'CONTROL: after the whole matrix, the untouched pair still authenticates',
                it.state === 'AuthenticatedWithMatchingAnchorUnconfirmed' && it.memoHex === HELLO && s.renderedMemoCount === 1,
                `${it.state}`);
        }

        // Stash the bytes the airplane test will use, so that phase can run
        // with no fetch of its own.
        window.__AIRPLANE__ = { refTx, refWrap };
    } catch (err) {
        R.error = String(err && err.stack ? err.stack : err);
    }

    R.pass = R.checks.filter((c) => c.pass).length;
    R.fail = R.checks.filter((c) => !c.pass).length;
    window.__MATRIX__ = R;
    return R;
})()

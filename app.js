'use strict';
// erstdenken – Spielablauf. Die Inhalte kommen aus daten/karten.js (erzeugt aus karten/).

const DATA = window.ERSTDENKEN;
const TOTAL = DATA.tage.length;
const BONUS = DATA.bonus || [];
const karteVon = id => DATA.tage.find(t => t.id === id) || BONUS.find(b => b.id === id);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');             // ?test → alle Tage offen, eigener Spielstand
const KEY = TEST ? 'erstdenken.test.v1' : 'erstdenken.v1';

const chat = document.getElementById('chat');
const dock = document.getElementById('dock');
const label = document.getElementById('label');
const sheet = document.getElementById('sheet');
const sheetInner = document.getElementById('sheetInner');

// ---------- Spielstand (bleibt auf diesem Gerät) ----------
function load() {
	try { return JSON.parse(localStorage.getItem(KEY)) || { gespielt: {} }; }
	catch { return { gespielt: {} }; }
}
let state = load();
state.bonus = state.bonus || {};
// Ältere Spielstände kennen die Fall-ID noch nicht
Object.entries(state.gespielt).forEach(([t, r]) => { if (!r.id && DATA.tage[t - 1]) r.id = DATA.tage[t - 1].id; });
const alleErgebnisse = () => [...Object.values(state.gespielt), ...Object.values(state.bonus)];
const naechsterBonus = () => BONUS.find(b => !state.bonus[b.id]);
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

// ---------- Datum und Tag ----------
const DAY = 86400000;
const [sy, sm, sd] = DATA.start.split('-').map(Number);
const START = new Date(sy, sm - 1, sd);
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateOfDay = n => new Date(sy, sm - 1, sd + n - 1);
const fmt = d => d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const dayIndex = () => Math.round((today() - START) / DAY) + 1;
const offenBis = () => TEST ? TOTAL : Math.max(0, Math.min(dayIndex(), TOTAL));

// ---------- Hell/Dunkel ----------
const themeBtn = document.getElementById('themeBtn');
const isDark = () => document.documentElement.dataset.theme
	? document.documentElement.dataset.theme === 'dark'
	: matchMedia('(prefers-color-scheme: dark)').matches;
const paintThemeBtn = () => { themeBtn.textContent = isDark() ? '☀' : '☾'; };
paintThemeBtn();
themeBtn.onclick = () => {
	const t = isDark() ? 'light' : 'dark';
	document.documentElement.dataset.theme = t;
	try { localStorage.setItem('erstdenken.theme', t); } catch {}
	paintThemeBtn();
};

// ---------- Chat-Bausteine ----------
let hurry = false;                           // Tippen in den Chat überspringt Wartezeiten
chat.addEventListener('click', e => { if (!e.target.closest('a, .selectable, .single-image img')) hurry = true; });
function wait(ms) {
	return new Promise(r => {
		const t0 = Date.now();
		const tick = () => (hurry || Date.now() - t0 >= ms) ? r() : setTimeout(tick, 40);
		tick();
	});
}
const people = {
	ki: { name: 'Fall des Tages', icon: '🔍' },
	malia: { name: 'Malia, 12', icon: '🧒' }
};
let lastLeft = null;
// Kein automatisches Mitscrollen: Wer liest, bleibt, wo er ist.
// Liegt Neues unterhalb des sichtbaren Bereichs, erscheint ein Hinweis zum Runterspringen.
const pill = document.getElementById('newPill');
const unterKante = () => {
	const last = chat.lastElementChild;
	return last ? last.getBoundingClientRect().bottom : 0;
};
const dockBox = dock.parentElement;
const sichtbarBis = () => window.innerHeight - (dock.offsetHeight + 34);
// Antwort-Knöpfe erscheinen nur, wenn die neueste Nachricht zu sehen ist
function scrollDown() {
	const unten = unterKante() <= sichtbarBis() + 6;
	dockBox.classList.toggle('versteckt', !unten);
	pill.textContent = dock.children.length ? '↓ Antworten' : '↓ Neue Nachricht';
	pill.classList.toggle('show', !unten);
}
function zumEnde() { window.scrollBy({ top: unterKante() - sichtbarBis() + 12, behavior: 'smooth' }); }
pill.onclick = zumEnde;
window.addEventListener('scroll', scrollDown, { passive: true });
window.addEventListener('resize', scrollDown);
function reveal(el) { void el.offsetWidth; el.classList.add('visible'); }
function avatar(who) {
	const p = people[who];
	const row = document.createElement('div');
	row.className = 'avatar';
	row.innerHTML = '<div class="avatar__img"></div><div class="avatar__name"></div>';
	row.children[0].textContent = p.icon;
	row.children[1].textContent = p.name;
	chat.appendChild(row);
	reveal(row);
}
async function say(text, who = 'ki', cls = '') {
	if (who !== lastLeft) { avatar(who); lastLeft = who; }
	const typing = document.createElement('div');
	typing.className = 'bubble left typing visible';
	typing.innerHTML = '<span></span><span></span><span></span>';
	chat.appendChild(typing);
	scrollDown();
	await wait(Math.min(400 + text.length * 13, 1600));
	typing.remove();
	const b = document.createElement('div');
	b.className = 'bubble left ' + cls;
	b.textContent = text;
	chat.appendChild(b);
	reveal(b);
	scrollDown();
	await wait(220);
	return b;
}
async function sayLinks(intro, links) {
	const b = await say(intro);
	links.forEach(l => {
		b.appendChild(document.createElement('br'));
		if (l.url) {
			const a = document.createElement('a');
			a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
			a.textContent = l.name;
			b.appendChild(a);
		} else b.appendChild(document.createTextNode(l.name));
	});
	scrollDown();
}
function me(text) {
	const b = document.createElement('div');
	b.className = 'bubble right';
	b.textContent = text;
	chat.appendChild(b);
	reveal(b);
	scrollDown();
}
async function note(text, pause = 600) {
	const n = document.createElement('div');
	n.className = 'interstitial';
	n.textContent = text;
	chat.appendChild(n);
	reveal(n);
	scrollDown();
	await wait(pause);
}
async function photo(img) {
	const f = document.createElement('figure');
	f.className = 'single-image';
	const el = document.createElement('img');
	el.src = img.src;
	el.alt = img.text;
	const cap = document.createElement('figcaption');
	cap.textContent = img.text;
	const c = document.createElement('span');
	c.className = 'credit';
	const a = document.createElement('a');
	a.href = img.seite || img.src; a.target = '_blank'; a.rel = 'noopener';
	a.textContent = img.credit;
	c.appendChild(a);
	cap.appendChild(c);
	f.append(el, cap);
	chat.appendChild(f);
	await new Promise(r => { el.onload = el.onerror = r; setTimeout(r, 3000); });
	reveal(f);
	scrollDown();
	await wait(600);
}
// Antwort-Chips; gibt den gewählten Text zurück
function choose(options, { quiet = [], primary = [] } = {}) {
	hurry = false;
	return new Promise(resolve => {
		dock.innerHTML = '';
		const wrap = document.createElement('div');
		wrap.className = 'chips';
		options.forEach(opt => {
			const c = document.createElement('button');
			c.className = 'chip' + (quiet.includes(opt) ? ' quiet' : '') + (primary.includes(opt) ? ' primary' : '');
			c.textContent = opt;
			c.onclick = () => { dock.innerHTML = ''; me(opt.replace(' ✓', '')); resolve(opt.replace(' ✓', '')); };
			wrap.appendChild(c);
		});
		dock.appendChild(wrap);
		scrollDown();
	});
}
// Freitext; gibt null zurück, wenn übersprungen
function ask(placeholder, hintText = '', skipLabel = '') {
	hurry = false;
	return new Promise(resolve => {
		dock.innerHTML = '';
		const row = document.createElement('div');
		row.className = 'composer';
		const ta = document.createElement('textarea');
		ta.rows = 1;
		ta.placeholder = placeholder;
		const btn = document.createElement('button');
		btn.textContent = '↑';
		btn.disabled = true;
		btn.setAttribute('aria-label', 'Senden');
		const send = () => {
			const v = ta.value.trim();
			if (!v) return;
			dock.innerHTML = '';
			me(v);
			resolve(v);
		};
		ta.oninput = () => {
			btn.disabled = !ta.value.trim();
			ta.style.height = 'auto';
			ta.style.height = ta.scrollHeight + 'px';
		};
		ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
		btn.onclick = send;
		row.append(ta, btn);
		dock.appendChild(row);
		if (hintText) {
			const h = document.createElement('div');
			h.className = 'hint';
			h.textContent = hintText;
			dock.appendChild(h);
		}
		if (skipLabel) {
			const s = document.createElement('button');
			s.className = 'skip';
			s.textContent = skipLabel;
			s.onclick = () => { dock.innerHTML = ''; resolve(null); };
			dock.appendChild(s);
		}
		scrollDown();
		if (!dockBox.classList.contains('versteckt')) ta.focus({ preventScroll: true });
	});
}
// Bilder groß ansehen
const lightbox = document.getElementById('lightbox');
function zeigeGross(img) {
	let gross = lightbox.querySelector('img');
	if (!gross) { gross = document.createElement('img'); lightbox.insertBefore(gross, lightbox.querySelector('p')); }
	gross.src = img.src;
	gross.alt = img.alt;
	lightbox.querySelector('p').textContent = img.alt;
	lightbox.classList.add('open');
}
const schliesseGross = () => lightbox.classList.remove('open');
lightbox.onclick = schliesseGross;
document.addEventListener('keydown', e => { if (e.key === 'Escape') schliesseGross(); });
chat.addEventListener('click', e => {
	const img = e.target.closest('.single-image img');
	if (img) { e.stopPropagation(); zeigeGross(img); }
}, true);

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const NUM = ['①', '②', '③', '④', '⑤', '⑥'];

// Chips in fester, aber nicht vorhersehbarer Reihenfolge (pro Karte immer gleich)
function shuffle(arr, seed) {
	let h = 2166136261;
	for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
	const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
	const a = arr.slice();
	for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
	return a;
}
async function bubblesWithImages(list, bilder, ort) {
	for (let i = 0; i < list.length; i++) {
		await say(list[i]);
		for (const img of bilder.filter(b => b.ort === ort && b.nach === i)) await photo(img);
	}
}

// ---------- Abruf früherer Fälle ----------
// Gefragt wird nach Fällen, die man vor 7 Tagen und gestern gespielt hat – höchstens einmal pro Tag.
const vorTagen = n => { const d = today(); return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)); };
async function abruf(aktuelleId) {
	if (!TEST && state.abrufAm === iso(today())) return [];
	const faelle = alleErgebnisse().filter(r => r.typ === 'fall' && r.id && r.id !== aktuelleId);
	let ziele;
	if (TEST) ziele = faelle.slice(-2);
	else ziele = [7, 1].map(n => faelle.filter(r => r.datum === vorTagen(n)).pop()).filter(Boolean);
	const res = [];
	if (!ziele.length) return res;
	await say(ziele.length > 1 ? 'Moin! Erst zwei kurze Fragen von früher. 👋' : 'Moin! Erst eine kurze Frage zu einem früheren Fall. 👋');
	for (const z of ziele) {
		const k = karteVon(z.id);
		if (!k) continue;
		await say(k.abruf.frage);
		const a = await choose(shuffle(k.abruf.chips, k.id + 'abruf'));
		const ok = a === k.abruf.richtig;
		await say(ok ? pick(['Sitzt. 👌', 'Genau so.', 'Richtig, gut gemerkt.']) : `Es war: ${k.abruf.richtig}.`);
		res.push({ fall: k.id, richtig: ok });
	}
	state.abrufAm = iso(today());
	save();
	return res;
}

// ---------- Ein Fall ----------
async function spieleFall(k, tag, zaehlt) {
	const r = { typ: 'fall', id: k.id, titel: k.titel, hinweise: 0, abrufe: [] };

	if (zaehlt) r.abrufe = await abruf(k.id);
	if (tag === 1 && !r.abrufe.length) {
		await say('Hallo! Hier ist dein Fall des Tages. 🔍');
		await say('So geht’s: Ich zeige dir einen Fall. Du rätst zuerst. Hinweise gibt’s, aber sie kosten Punkte. Erst dann löse ich auf. Und jeden Tag lernst du was Neues.');
	} else if (!r.abrufe.length) {
		await say(pick(['Moin! Neuer Fall. 👋', 'Da bist du ja. Neuer Fall.', 'Hallo! Heute wird’s spannend.']));
	}

	await note(tag ? '— Fall des Tages —' : '— Bonusfall —', 800);
	await bubblesWithImages(k.einstieg, k.bilder, 'einstieg');
	await say(k.frage);

	const optionen = shuffle(k.chips, k.id);
	let tipp = await choose(optionen);
	r.ersterTipp = tipp;
	await say('Notiert. Bevor du dich festlegst: Ich habe drei Hinweise. Jeder kostet dich einen Punkt.');

	while (r.hinweise < k.hinweise.length) {
		const next = await choose(['Hinweis bitte', 'Ich lege mich fest'], { quiet: ['Ich lege mich fest'] });
		if (next === 'Ich lege mich fest') break;
		r.hinweise++;
		await note(`— Hinweis ${r.hinweise} von ${k.hinweise.length} —`);
		await say(k.hinweise[r.hinweise - 1]);
		await say(`Dein Tipp bisher: „${tipp}“. Bleibst du dabei?`);
		tipp = await choose(optionen.map(o => o === tipp ? o + ' ✓' : o));
	}

	await say(`Final: „${tipp}“. Wie sicher bist du?`);
	r.sicherheit = parseInt(await choose(['50 %', '70 %', '90 %']), 10);
	r.tipp = tipp;
	r.richtig = tipp === k.richtig;

	await note('— Auflösung —', 1500);
	if (r.richtig) {
		await say(r.hinweise === 0 ? 'Richtig. Ganz ohne Hinweis. 🔥' : `Richtig. Mit ${r.hinweise} Hinweis${r.hinweise > 1 ? 'en' : ''}.`);
		if (r.sicherheit === 50) await say('Und du warst nur 50 % sicher. Du weißt mehr, als du dir zutraust.');
	} else {
		await say(`Nicht ganz. Richtig ist: „${k.richtig}“.`);
		if (r.sicherheit === 90) await say('Du warst dir 90 % sicher. Gute Nachricht: Genau solche Irrtümer merkt sich das Gehirn am besten.');
	}
	await bubblesWithImages(k.aufloesung, k.bilder, 'aufloesung');
	await say('Der Dreh: ' + k.dreh);

	// Warum?
	await note('— Warum? —');
	await say('Jetzt du: ' + k.warum.frage);
	await ask('Deine Vermutung …', 'Ein, zwei Sätze reichen');
	await say('Noch ein Gedanke: ' + k.warum.nachfrage);
	await ask('Deine Antwort …');
	await say('Die wichtigsten Gründe:');
	for (let i = 0; i < k.warum.gruende.length; i++) await say(`${i + 1} · ${k.warum.gruende[i]}`);
	await say('Wie viele davon hattest du schon selbst?');
	const anz = k.warum.gruende.length === 2 ? ['Keinen', 'Einen', 'Beide'] : ['Keinen', 'Einen', 'Zwei', 'Alle drei'];
	const own = await choose(anz);
	r.eigeneGruende = anz.indexOf(own);
	await say(own === 'Keinen' ? 'Macht nichts. Jetzt hast du sie. 😉' : 'Stark. Selbst gefunden hält besser als vorgelesen.');

	// Prüf-Runde
	await note('— Prüf-Runde —');
	await say('Hier ist meine Zusammenfassung. Ein Satz stimmt nicht. Findest du ihn?');
	for (let i = 0; i < k.pruef.length; i++) await say(`${NUM[i]} ${k.pruef[i].satz}`);
	const falschIdx = k.pruef.findIndex(p => p.falsch);
	r.fehlerGefunden = false;
	for (let versuch = 0; versuch < 2 && !r.fehlerGefunden; versuch++) {
		const p = await choose(k.pruef.map((_, i) => NUM[i]));
		if (NUM.indexOf(p) === falschIdx) {
			r.fehlerGefunden = true;
			r.fehlerVersuch = versuch + 1;
			await say('Erwischt. ' + k.pruef[falschIdx].korrektur);
			await say('Genau so klingen KI-Fehler: fast richtig und sehr selbstbewusst.');
		} else if (versuch === 0) {
			await say('Der Satz stimmt. Schau dir die anderen noch mal genau an …');
		} else {
			await say(`Es war ${NUM[falschIdx]}: ${k.pruef[falschIdx].korrektur}`);
			await say('Fast richtig, das ist das Gefährliche an KI-Fehlern.');
		}
	}

	// Malia, 12
	await note('— Malia, 12, hat eine Frage —', 800);
	await say(k.malia.frage, 'malia');
	const a1 = await ask('Erklär’s Malia …', 'Zwei, drei Sätze. Keine Fachwörter.', 'Heute überspringen');
	r.malia = null;
	if (a1 === null) {
		await say('Schade. Dann frag ich nächstes Mal. 🙂', 'malia');
	} else {
		const treffer = text => k.malia.punkte.map(p => p.worte.some(w => text.toLowerCase().includes(w)));
		let h = treffer(a1);
		const fehltIdx = h.indexOf(false);
		await say(fehltIdx >= 0 ? k.malia.punkte[fehltIdx].nachfrage : k.malia.allesDrin, 'malia');
		const a2 = await ask('Antwort an Malia …', '', 'Überspringen');
		h = treffer(a1 + ' ' + (a2 || ''));
		r.malia = h.filter(Boolean).length;
		await say(r.malia >= Math.min(2, h.length) ? k.malia.verstanden : k.malia.halb, 'malia');
		await say('Kurzer Check deiner Erklärung:\n' + k.malia.punkte.map((p, i) => (h[i] ? '✓ ' : '○ ') + p.name).join('\n'));
	}

	await abschluss(k, tag, r, zaehlt);
}

// ---------- Fehlerjagd ----------
async function spieleFehlerjagd(k, tag, zaehlt) {
	const r = { typ: 'fehlerjagd', titel: k.titel };
	await note('— Fehlerjagd —', 800);
	for (const e of k.einstieg) await say(e);
	const blasen = [];
	for (let i = 0; i < k.aussagen.length; i++) {
		const b = await say(`${NUM[i]} ${k.aussagen[i].satz}`, 'ki', 'selectable');
		b.onclick = () => { if (b.classList.contains('selectable')) { b.classList.toggle('selected'); paintDone(); } };
		blasen.push(b);
	}
	const markiert = () => blasen.filter(b => b.classList.contains('selected')).length;
	let doneBtn;
	const paintDone = () => { if (doneBtn) doneBtn.textContent = `Fertig · ${markiert()} markiert`; };
	hurry = false;
	await new Promise(resolve => {
		dock.innerHTML = '';
		const wrap = document.createElement('div');
		wrap.className = 'chips';
		const hint = document.createElement('div');
		hint.className = 'hint';
		hint.textContent = 'Tipp die verdächtigen Sätze oben an.';
		doneBtn = document.createElement('button');
		doneBtn.className = 'chip primary';
		doneBtn.onclick = () => { dock.innerHTML = ''; me(`Fertig, ${markiert()} markiert.`); resolve(); };
		paintDone();
		wrap.appendChild(doneBtn);
		dock.append(wrap, hint);
		scrollDown();
	});
	blasen.forEach(b => b.classList.remove('selectable'));

	await note('— Auflösung —', 1200);
	r.gefunden = 0; r.falschVerdacht = 0;
	const titelVon = id => (DATA.tage.find(t => t.id === id) || {}).titel || '';
	for (let i = 0; i < k.aussagen.length; i++) {
		const a = k.aussagen[i];
		const sel = blasen[i].classList.contains('selected');
		if (a.falsch && sel) { r.gefunden++; await say(`${NUM[i]} Gefunden. ${a.korrektur} (${titelVon(a.fall)})`); }
		else if (a.falsch) await say(`${NUM[i]} Übersehen. ${a.korrektur} (${titelVon(a.fall)})`);
		else if (sel) { r.falschVerdacht++; await say(`${NUM[i]} stimmt. Fast-richtig fühlt sich manchmal falsch an.`); }
	}
	await say(k.schluss);
	await abschluss(k, tag, r, zaehlt);
}

// ---------- Ergebnis ----------
function shareText(tag, r) {
	const kopf = tag ? `erstdenken · Tag ${tag}/${TOTAL}` : 'erstdenken · Bonusfall';
	const link = TEST ? '' : '\n' + location.origin + location.pathname;
	if (r.typ === 'fehlerjagd') return `${kopf} · Fehlerjagd\n🔍 ${r.gefunden}/3 gefunden · ${r.falschVerdacht} falsch verdächtigt` + link;
	return [kopf,
		`Hinweise ${'●'.repeat(r.hinweise)}${'○'.repeat(3 - r.hinweise)}`,
		`Tipp ${r.richtig ? '✓' : '✗'} · ${r.sicherheit} % sicher`,
		`KI-Fehler ${r.fehlerGefunden ? 'gefunden ✓' : 'übersehen ✗'}`,
		r.malia === null ? null : `Malia ${r.malia}/${3}`
	].filter(Boolean).join('\n') + link;
}
async function teilen(text) {
	try {
		if (navigator.share) { await navigator.share({ text }); return; }
		await navigator.clipboard.writeText(text);
		await say('Kopiert. Ohne Spoiler, teilen erlaubt. 📋');
	} catch (e) {
		if (e && e.name === 'AbortError') return;
		await say('Kopieren ging hier nicht. Markier den Kasten oben einfach von Hand.');
	}
}
async function abschluss(k, tag, r, zaehlt) {
	await note('— Ergebnis —', 800);
	const text = shareText(tag, r);
	await say(text, 'ki', 'card');
	if (zaehlt && !tag) {
		r.datum = iso(today());
		r.share = text;
		state.bonus[k.id] = r;
		save();
		await say('Gut gemacht. Den merk ich mir und frag dich bald danach.');
	} else if (zaehlt) {
		r.datum = iso(today());
		r.nachgeholt = !TEST && r.datum !== iso(dateOfDay(tag));
		r.share = text;
		state.gespielt[tag] = r;
		save();
		if (tag < TOTAL) await say(k.typ === 'fall' ? 'Morgen frag ich dich nach diesem Fall. Bis dann!' : 'Bis morgen, neuer Fall!');
		else await say('Das war der letzte Tag. Danke fürs Mitdenken! Unter „Tage“ siehst du deine Bilanz.');
	} else {
		await say('Das war eine Probe, sie zählt nicht.');
	}
	await nachRunde(k, tag);
}
async function nachRunde(k, tag) {
	const offen = offeneTage();
	while (true) {
		const opts = ['Ergebnis teilen'];
		if (k.quellen && k.quellen.length) opts.push('Quellen');
		if (offen.length) opts.push('Verpasstes nachholen');
		if (naechsterBonus()) opts.push('Noch ein Fall');
		opts.push('Alle Tage');
		const w = await choose(opts, { quiet: ['Alle Tage'] });
		if (w === 'Noch ein Fall') { goBonus(naechsterBonus().id); return; }
		if (w === 'Ergebnis teilen') await teilen(((tag ? state.gespielt[tag] : state.bonus[k.id]) || {}).share || [...chat.querySelectorAll('.card')].pop()?.textContent || '');
		if (w === 'Quellen') await sayLinks('Woher ich das weiß:', k.quellen);
		if (w === 'Verpasstes nachholen') { go(offen[0]); return; }
		if (w === 'Alle Tage') openSheet();
	}
}

// ---------- Navigation ----------
function offeneTage() {
	const bis = offenBis();
	const out = [];
	for (let t = 1; t <= bis; t++) if (!state.gespielt[t]) out.push(t);
	return out;
}
function goBonus(id) {
	const p = new URLSearchParams();
	if (TEST) p.set('test', '');
	p.set('bonus', id);
	location.search = p.toString().replace(/=(&|$)/g, '$1');
}
function go(tag, extra = '') {
	const p = new URLSearchParams();
	if (TEST) p.set('test', '');
	if (tag) p.set('tag', tag);
	if (extra) p.set(extra, '');
	location.search = p.toString().replace(/=(&|$)/g, '$1');
}

function statistik() {
	const g = Object.values(state.gespielt);
	const faelle = alleErgebnisse().filter(r => r.typ === 'fall');
	const abrufe = faelle.flatMap(r => r.abrufe || []);
	const kal = {};
	faelle.forEach(r => { kal[r.sicherheit] = kal[r.sicherheit] || [0, 0]; kal[r.sicherheit][1]++; if (r.richtig) kal[r.sicherheit][0]++; });
	return {
		gespielt: g.length,
		richtig: faelle.filter(r => r.richtig).length,
		faelle: faelle.length,
		abrufRichtig: abrufe.filter(a => a.richtig).length,
		abrufe: abrufe.length,
		fehler: faelle.filter(r => r.fehlerGefunden).length + g.filter(r => r.typ === 'fehlerjagd').reduce((s, r) => s + r.gefunden, 0),
		fehlerMoeglich: faelle.length + g.filter(r => r.typ === 'fehlerjagd').length * 3,
		kal
	};
}
function openSheet() {
	const s = statistik();
	const bis = offenBis();
	let html = `<h2>Deine ${TOTAL} Tage</h2><p>Start ${fmt(START)}${TEST ? ' · Testmodus, alles offen' : ''}</p>`;
	html += '<div class="stats">'
		+ `<div class="stat"><b>${s.gespielt}/${TOTAL}</b><span>Tage gespielt</span></div>`
		+ `<div class="stat"><b>${s.abrufe ? s.abrufRichtig + '/' + s.abrufe : '–'}</b><span>später noch gewusst</span></div>`
		+ `<div class="stat"><b>${s.faelle ? s.richtig + '/' + s.faelle : '–'}</b><span>Fälle richtig gelöst</span></div>`
		+ `<div class="stat"><b>${s.fehlerMoeglich ? s.fehler + '/' + s.fehlerMoeglich : '–'}</b><span>KI-Fehler gefunden</span></div>`
		+ '</div>';
	const kalText = [50, 70, 90].filter(p => s.kal[p]).map(p => `bei ${p} % sicher: ${s.kal[p][0]} von ${s.kal[p][1]} richtig`).join(' · ');
	if (kalText) html += `<p>Wie gut passt deine Sicherheit? ${kalText}</p>`;
	DATA.tage.forEach(k => {
		const r = state.gespielt[k.tag];
		const frei = k.tag <= bis;
		const titel = r ? k.titel : (k.typ === 'fehlerjagd' ? 'Fehlerjagd' : 'Fall');
		const zustand = r ? (r.nachgeholt ? '✓ nachgeholt' : '✓') : frei ? 'offen' : 'ab ' + dateOfDay(k.tag).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
		html += `<button class="day" data-tag="${k.tag}" ${frei ? '' : 'disabled'}><span class="day__nr">Tag ${k.tag}</span><span class="day__title">${titel}</span><span class="day__state">${zustand}</span></button>`;
	});
	if (BONUS.length) {
		const fertig = BONUS.filter(b => state.bonus[b.id]).length;
		html += `<h2 style="margin-top:32px">Bonusfälle</h2><p>Für Tage, an denen du mehr willst: ${fertig} von ${BONUS.length} gespielt.</p>`;
		BONUS.forEach((b, i) => {
			const r = state.bonus[b.id];
			const frei = r || b === naechsterBonus();
			html += `<button class="day" data-bonus="${b.id}" ${frei ? '' : 'disabled'}><span class="day__nr">Bonus ${i + 1}</span><span class="day__title">${r ? b.titel : 'Fall'}</span><span class="day__state">${r ? '✓' : frei ? 'als Nächstes' : ''}</span></button>`;
		});
	}
	html += '<p style="margin-top:24px">Dein Spielstand bleibt auf diesem Gerät. <button class="skip" id="closeSheet" style="display:inline;margin:0">Zurück zum Chat</button></p>';
	sheetInner.innerHTML = html;
	sheetInner.querySelectorAll('.day:not([disabled])').forEach(b => b.onclick = () => b.dataset.bonus ? goBonus(b.dataset.bonus) : go(+b.dataset.tag));
	document.getElementById('closeSheet').onclick = closeSheet;
	sheet.classList.add('open');
	document.getElementById('daysBtn').textContent = 'Chat';
}
function closeSheet() { sheet.classList.remove('open'); document.getElementById('daysBtn').textContent = 'Tage'; }
document.getElementById('daysBtn').onclick = () => sheet.classList.contains('open') ? closeSheet() : openSheet();

// ---------- Start ----------
async function spiele(tag, zaehlt) {
	const k = DATA.tage[tag - 1];
	label.textContent = `erstdenken · Tag ${tag} von ${TOTAL}${zaehlt ? '' : ' · Probe'}`;
	if (k.typ === 'fall') await spieleFall(k, tag, zaehlt);
	else await spieleFehlerjagd(k, tag, zaehlt);
}
async function spieleBonus(id) {
	const k = BONUS.find(b => b.id === id);
	const nr = BONUS.indexOf(k) + 1;
	label.textContent = `erstdenken · Bonusfall ${nr} von ${BONUS.length}`;
	if (state.bonus[id]) {
		await say('Diesen Bonusfall hast du schon gespielt. ✓');
		await say(state.bonus[id].share, 'ki', 'card');
		const w = await choose(['Nochmal spielen (zählt nicht)', 'Alle Tage'], { quiet: ['Alle Tage'] });
		if (w === 'Alle Tage') { openSheet(); return; }
		chat.innerHTML = ''; lastLeft = null;
		return spieleFall(k, null, false);
	}
	await spieleFall(k, null, true);
}
async function schonGespielt(tag) {
	const k = DATA.tage[tag - 1];
	const r = state.gespielt[tag];
	label.textContent = `erstdenken · Tag ${tag} von ${TOTAL}`;
	await say(tag === dayIndex() ? 'Der heutige Fall ist erledigt. ✓' : `Tag ${tag} hast du schon gespielt. ✓`);
	await say(r.share, 'ki', 'card');
	const offen = offeneTage();
	if (offen.length) await say(`Du hast noch ${offen.length === 1 ? 'einen Tag' : offen.length + ' Tage'} offen.`);
	else if (dayIndex() < TOTAL && !TEST) await say(`Der nächste Fall des Tages kommt ${fmt(dateOfDay(dayIndex() + 1))}.${naechsterBonus() ? ' Lust auf einen Bonusfall?' : ''}`);
	const opts = [];
	if (offen.length) opts.push('Verpasstes nachholen');
	if (naechsterBonus()) opts.push('Noch ein Fall');
	opts.push('Nochmal spielen (zählt nicht)', 'Alle Tage');
	const w = await choose(opts, { quiet: ['Alle Tage'] });
	if (w === 'Verpasstes nachholen') return go(offen[0]);
	if (w === 'Noch ein Fall') return goBonus(naechsterBonus().id);
	if (w === 'Alle Tage') { openSheet(); return schonGespielt(tag); }
	chat.innerHTML = ''; lastLeft = null;
	await spiele(tag, false);
}
async function vorDemStart() {
	label.textContent = 'erstdenken';
	await say('Hallo! Hier ist dein Fall des Tages. 🔍');
	await say(`Ab ${fmt(START)} bekommst du jeden Tag einen Fall aus Geschichte und Alltag. ${TOTAL} Tage lang.`);
	await say('Die Regel ist einfach: Erst denkst du, dann löse ich auf. Und jeden Tag lernst du was Neues.');
	const w = await choose(['Probe spielen', 'Bis dann!'], { quiet: ['Bis dann!'] });
	if (w === 'Probe spielen') { chat.innerHTML = ''; lastLeft = null; await spiele(1, false); }
	else await say(`Bis ${fmt(START)}! 👋`);
}
async function nachDemEnde() {
	label.textContent = 'erstdenken';
	const s = statistik();
	await say(`Die ${TOTAL} Tage sind vorbei. Danke fürs Mitdenken! 🙌`);
	await say(`Du hast ${s.gespielt} von ${TOTAL} Tagen gespielt und ${s.abrufe ? s.abrufRichtig + ' von ' + s.abrufe : 'keine'} Abruf-Fragen richtig beantwortet.`);
	await choose(['Alle Tage ansehen']);
	openSheet();
}

(async function main() {
	const n = dayIndex();
	const bonusId = params.get('bonus');
	if (bonusId && BONUS.some(b => b.id === bonusId)) return spieleBonus(bonusId);
	const wunsch = parseInt(params.get('tag'), 10);
	if (wunsch >= 1 && wunsch <= offenBis()) {
		if (state.gespielt[wunsch]) return schonGespielt(wunsch);
		return spiele(wunsch, true);
	}
	if (!TEST && n < 1) return vorDemStart();
	if (!TEST && n > TOTAL && !offeneTage().length) return nachDemEnde();
	const heute = TEST ? (offeneTage()[0] || TOTAL) : Math.min(n, TOTAL);
	if (state.gespielt[heute]) return schonGespielt(heute);
	return spiele(heute, true);
})();

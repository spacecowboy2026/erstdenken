'use strict';
// erstdenken – Spielablauf. Die Inhalte kommen aus daten/karten.js (erzeugt aus karten/).
// Seit 17.10.2026: kein Tagesplan mehr, sondern ein Topf mit Fällen, aus dem zufällig gezogen wird.

const FAELLE = window.ERSTDENKEN.faelle;
const karteVon = id => FAELLE.find(k => k.id === id);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');             // ?test → eigener Spielstand zum Ausprobieren
// Themen-Ausgaben (seit 22.10.2026: /musik) nutzen dieselbe Logik mit eigenen Fällen und eigenem Spielstand
const MUSIK = window.ERSTDENKEN.thema === 'musik';
const KEY = MUSIK ? (TEST ? 'erstdenken.musik.test.v2' : 'erstdenken.musik.v2') : (TEST ? 'erstdenken.test.v2' : 'erstdenken.v2');
const NAME = MUSIK ? 'erstdenken ♪' : 'erstdenken';
const THEMEN = MUSIK
	? 'rund um Musik: Geschichte, einfache Theorie, Songwriting, Studio und Musikbusiness'
	: 'aus Geschichte, Alltag, Wissenschaft oder Philosophie';

const chat = document.getElementById('chat');
const dock = document.getElementById('dock');
const label = document.getElementById('label');
const sheet = document.getElementById('sheet');
const sheetInner = document.getElementById('sheetInner');

// ---------- Spielstand (bleibt auf diesem Gerät) ----------
function leer() { return { gespielt: {}, fehlerjagden: [] }; }
function load() {
	try {
		const s = JSON.parse(localStorage.getItem(KEY));
		if (s) return s;
		if (MUSIK) return leer();
		return uebernehmeAlt(JSON.parse(localStorage.getItem(TEST ? 'erstdenken.test.v1' : 'erstdenken.v1')));
	} catch { return leer(); }
}
// Spielstand aus der ersten Version (mit Tagesplan) übernehmen
function uebernehmeAlt(alt) {
	const neu = leer();
	if (!alt) return neu;
	const alterPlan = ['mauer-nacht', 'runde-kanaldeckel', 'penicillin', 'einkaufswagen', 'kolumbus-rechenfehler', 'bleistift-ohne-blei', null,
		'sarajevo-1914', 'einheitszeit', 'vasa', 'jeans-nieten', 'mars-climate-orbiter', 'erste-ampel', null];
	const alle = [...Object.entries(alt.gespielt || {}).map(([t, r]) => ({ ...r, id: r.id || alterPlan[t - 1] })), ...Object.values(alt.bonus || {})];
	alle.filter(r => r.typ === 'fall' && r.id && karteVon(r.id)).forEach(r => {
		r.punkte = r.punkte ?? punkteFuer(r);
		neu.gespielt[r.id] = r;
	});
	neu.intro = alle.length > 0;
	return neu;
}
let state = load();
state.gespielt = state.gespielt || {};
state.fehlerjagden = state.fehlerjagden || [];
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

// ---------- Datum ----------
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const vorTagen = n => { const d = today(); return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)); };

// ---------- Punkte ----------
// Lösung ohne Hinweis 3, mit einem 2, mit zwei 1, mit drei 0 · Warum: +1 · KI-Fehler beim ersten Versuch: +1 · Malia: +1
function punkteFuer(r) {
	return (r.richtig ? Math.max(0, 3 - (r.hinweise || 0)) : 0)
		+ (r.gruendeSelbst > 0 ? 1 : 0)
		+ (r.fehlerGefunden && r.fehlerVersuch === 1 ? 1 : 0)
		+ (r.malia >= 2 ? 1 : 0);
}
const gespielteListe = () => Object.values(state.gespielt).sort((a, b) => (a.zeit || 0) - (b.zeit || 0));
function gesamtPunkte() {
	return gespielteListe().reduce((s, r) => s + (r.punkte || 0) + (r.abrufe || []).filter(a => a.richtig).length, 0)
		+ state.fehlerjagden.reduce((s, f) => s + (f.gefunden || 0), 0);
}
function zeigePunkte() { label.textContent = `${NAME} · ${gesamtPunkte()} Punkte`; }
const offeneFaelle = () => FAELLE.filter(k => !state.gespielt[k.id]);
const zufallsFall = () => { const o = offeneFaelle(); return o.length ? o[Math.floor(Math.random() * o.length)] : null; };

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
chat.addEventListener('click', e => { if (!e.target.closest('a, .selectable, .single-image img, .audio-msg')) hurry = true; });
function wait(ms) {
	return new Promise(r => {
		const t0 = Date.now();
		const tick = () => (hurry || Date.now() - t0 >= ms) ? r() : setTimeout(tick, 40);
		tick();
	});
}
const people = {
	ki: { name: 'erstdenken', icon: '🔍' },
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
// Antwort-Knöpfe erscheinen nur, wenn die neueste Nachricht zu sehen ist.
// Der Freiraum unter dem Chat wächst mit der Knopf-Leiste, sonst kann man bei vielen
// Knöpfen auf schmalen Handys nie weit genug scrollen (Fehler vom 22.10.2026).
const container = chat.parentElement;
function platzUnten() {
	const noetig = Math.max(260, dock.offsetHeight + 90);
	if (container.style.paddingBottom !== noetig + 'px') container.style.paddingBottom = noetig + 'px';
}
const ganzUnten = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
function scrollDown() {
	platzUnten();
	const unten = unterKante() <= sichtbarBis() + 6 || ganzUnten();
	dockBox.classList.toggle('versteckt', !unten);
	pill.textContent = dock.children.length ? '↓ Antworten' : '↓ Neue Nachricht';
	pill.classList.toggle('show', !unten);
}
function zumEnde() { window.scrollBy({ top: unterKante() - sichtbarBis() + 12, behavior: 'smooth' }); }
pill.onclick = zumEnde;
window.addEventListener('scroll', scrollDown, { passive: true });
window.addEventListener('resize', scrollDown);
if (window.ResizeObserver) new ResizeObserver(scrollDown).observe(dock);
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
async function bubblesWithImages(list, bilder, ort, audio) {
	for (let i = 0; i < list.length; i++) {
		await say(list[i]);
		for (const img of bilder.filter(b => b.ort === ort && b.nach === i)) await photo(img);
		if (audio && audio.ort === ort && audio.nach === i) await ton(audio);
	}
}
// Original-Ton als Sprachnachricht
let aktuellerTon = null;
const fmtZeit = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '';
async function ton(a) {
	const f = document.createElement('figure');
	f.className = 'audio-msg';
	f.innerHTML = '<div class="audio-msg__bubble"><button class="audio-msg__play" aria-label="Abspielen">▶</button><div class="audio-msg__bar"><span></span></div><span class="audio-msg__time"></span></div><figcaption><span class="audio-msg__text"></span><span class="credit"><a target="_blank" rel="noopener"></a></span></figcaption>';
	const el = new Audio();
	el.preload = 'none';
	el.src = a.src;
	const btn = f.querySelector('.audio-msg__play');
	const fill = f.querySelector('.audio-msg__bar span');
	const time = f.querySelector('.audio-msg__time');
	time.textContent = a.laenge || '';
	f.querySelector('.audio-msg__text').textContent = `🔊 ${a.art || 'Original-Ton'}: ${a.text}`;
	const link = f.querySelector('.credit a');
	link.href = a.seite || a.src;
	link.textContent = a.credit;
	btn.onclick = e => {
		e.stopPropagation();
		if (el.paused) {
			if (aktuellerTon && aktuellerTon !== el) aktuellerTon.pause();
			aktuellerTon = el;
			el.play().catch(() => { time.textContent = 'geht hier nicht'; });
		} else el.pause();
	};
	el.onplay = () => { btn.textContent = '❚❚'; btn.setAttribute('aria-label', 'Pause'); };
	el.onpause = el.onended = () => { btn.textContent = '▶'; btn.setAttribute('aria-label', 'Abspielen'); };
	el.ontimeupdate = () => {
		fill.style.width = (el.duration ? el.currentTime / el.duration * 100 : 0) + '%';
		time.textContent = fmtZeit(el.duration - el.currentTime) || a.laenge;
	};
	chat.appendChild(f);
	reveal(f);
	scrollDown();
	await wait(600);
}


// ---------- Einstieg: ganz einfach erklärt ----------
async function intro() {
	await say('Hallo! 👋 Kurz erklärt, worum es hier geht:');
	await say('KI beantwortet uns heute fast jede Frage. Praktisch. Aber wer nur noch fragt, verlernt das Selbst-Denken.');
	await say(`Hier ist es umgekehrt: Ich gebe dir einen kniffligen Fall ${THEMEN}. Und du knackst ihn selbst.`);
	await say('Das Schöne daran: Was man selbst herausfindet, vergisst man kaum. Genau dafür ist jeder Schritt hier gebaut.');
	await say(MUSIK ? 'Ein Fall dauert etwa 5 Minuten. Du brauchst kein Vorwissen. Wenn du selbst Musik machst, wirst du aber einiges wiedererkennen. 🎸' : 'Ein Fall dauert etwa 5 Minuten. Du brauchst kein Vorwissen.');
	let w = await choose(['Los geht’s', 'Wie läuft ein Fall ab?'], { quiet: ['Wie läuft ein Fall ab?'] });
	if (w !== 'Los geht’s') {
		await say('So läuft ein Fall ab:');
		await say('1 · Ich erzähle dir eine kurze Geschichte und stelle eine Frage.\n2 · Du tippst eine Antwort an. Wenn du hängst, hol dir einen Hinweis.\n3 · Ich löse auf und erkläre, was dahintersteckt.');
		await say('Danach noch drei kurze Extras: Du überlegst, warum es so kam. Du suchst einen Fehler, den eine KI eingebaut hat. Und du erklärst alles Malia, 12, in deinen eigenen Worten.');
		await say('Punkte gibt’s fürs Selbst-Denken: Ohne Hinweis 3 für die Lösung, mit jedem Hinweis einer weniger. Plus je einen fürs Warum, den KI-Fehler und Malia.');
		await say('Und in ein paar Tagen frag ich dich nochmal kurz nach dem Fall. Mal sehen, ob es hängen geblieben ist. 😉');
		await choose(['Los geht’s']);
	}
	state.intro = true;
	save();
}

// ---------- Abruf früherer Fälle (nach 1 und 7 Tagen, höchstens einmal pro Tag) ----------
async function abruf() {
	if (!TEST && state.abrufAm === iso(today())) return;
	const liste = gespielteListe();
	const ziele = TEST ? liste.slice(-2) : [7, 1].map(n => liste.filter(r => r.datum === vorTagen(n)).pop()).filter(Boolean);
	if (!ziele.length) return;
	await say(ziele.length > 1 ? 'Erst zwei kurze Fragen zu früheren Fällen. Mal sehen, was hängen geblieben ist. 👀' : 'Erst eine kurze Frage zu einem früheren Fall. Mal sehen, was hängen geblieben ist. 👀');
	for (const z of ziele) {
		const k = karteVon(z.id);
		if (!k) continue;
		await say(k.abruf.frage);
		const a = await choose(shuffle(k.abruf.chips, k.id + 'abruf'));
		const ok = a === k.abruf.richtig;
		await say(ok ? pick(['Sitzt. +1 Punkt 👌', 'Genau so. +1 Punkt', 'Richtig, gut gemerkt. +1 Punkt']) : `Es war: ${k.abruf.richtig}. Jetzt sitzt es bestimmt.`);
		z.abrufe = z.abrufe || [];
		z.abrufe.push({ datum: iso(today()), richtig: ok });
	}
	state.abrufAm = iso(today());
	save();
	zeigePunkte();
}

// ---------- Ein Fall ----------
// Stichwort-Erkennung: kurze Wörter (unter 5 Buchstaben) zählen nur am Wortanfang, damit „weg“ nicht in „wegen“ anspringt
const kommtVor = (text, w) => {
	const t = text.toLowerCase();
	if (w.length >= 5) return t.includes(w);
	return new RegExp('(^|[^a-zäöüß0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t);
};
const grundTreffer = (k, text) => k.warum.gruende.map(g => g.worte.length > 0 && g.worte.some(w => kommtVor(text, w)));

async function spieleFall(k, zaehlt = true) {
	const r = { typ: 'fall', id: k.id, titel: k.titel, hinweise: 0 };
	const neuling = gespielteListe().length < 3;

	await note('— Neuer Fall —', 700);
	await bubblesWithImages(k.einstieg, k.bilder, 'einstieg', k.audio);
	await say(k.frage);
	await say(neuling
		? 'Tipp deine Antwort an. Wenn du hängst, hol dir einen Hinweis. Ohne Hinweis gibt’s 3 Punkte, jeder Hinweis kostet einen.'
		: 'Deine Antwort? Oder erst ein Hinweis?');

	const optionen = shuffle(k.chips, k.id);
	let tipp;
	while (!tipp) {
		const hinweisChip = r.hinweise < k.hinweise.length ? [`Hinweis ${r.hinweise + 1} 🔍`] : [];
		const w = await choose([...optionen, ...hinweisChip], { quiet: hinweisChip });
		if (w.startsWith('Hinweis ')) {
			r.hinweise++;
			await note(`— Hinweis ${r.hinweise} von ${k.hinweise.length} —`);
			await say(k.hinweise[r.hinweise - 1]);
			await say(r.hinweise < k.hinweise.length ? 'Und, weißt du’s jetzt?' : 'Das war der letzte Hinweis. Jetzt du!');
		} else tipp = w;
	}
	r.tipp = tipp;
	r.richtig = tipp === k.richtig;
	await say(neuling ? 'Wie sicher bist du dir? Das hilft dir später zu sehen, wie gut dein Bauchgefühl ist.' : 'Wie sicher bist du?');
	r.sicherheit = parseInt(await choose(['50 %', '70 %', '90 %']), 10);

	// Auflösung
	await note('— Auflösung —', 1300);
	if (r.richtig) {
		const p = Math.max(0, 3 - r.hinweise);
		await say(r.hinweise === 0 ? `Richtig! Ganz ohne Hinweis. +${p} Punkte 🔥` : `Richtig! +${p} Punkt${p === 1 ? '' : 'e'}`);
		if (r.sicherheit === 50) await say('Und du warst nur 50 % sicher. Du weißt mehr, als du dir zutraust.');
	} else {
		await say(`Nicht ganz. Richtig ist: „${k.richtig}“.`);
		if (r.sicherheit === 90) await say('Du warst dir 90 % sicher. Gute Nachricht: Genau solche Irrtümer merkt sich das Gehirn am besten.');
	}
	await bubblesWithImages(k.aufloesung, k.bilder, 'aufloesung', k.audio);
	await say('Der Dreh: ' + k.dreh);

	// Warum? – erkennt grob, welche Gründe man schon selbst genannt hat
	await note('— Warum? —');
	await say('Jetzt du: ' + k.warum.frage);
	const a1 = await ask('Deine Vermutung …', 'Ein, zwei Sätze reichen', 'Überspringen');
	let text = a1 || '';
	if (a1 !== null) {
		const t1 = grundTreffer(k, a1).filter(Boolean).length;
		if (t1 >= Math.ceil(k.warum.gruende.length / 2)) {
			await say('Stark, genau darauf kommt es an! 💡');
		} else {
			await say((t1 ? 'Guter Punkt, da ist was dran. ' : 'Spannender Gedanke. ') + k.warum.nachfrage);
			const a2 = await ask('Deine Antwort …', '', 'Überspringen');
			text += ' ' + (a2 || '');
		}
	}
	const treffer = grundTreffer(k, text);
	r.gruendeSelbst = a1 === null ? 0 : treffer.filter(Boolean).length;
	await say('Die wichtigsten Gründe:');
	for (let i = 0; i < k.warum.gruende.length; i++) await say(`${treffer[i] && a1 !== null ? '✓' : '·'} ${k.warum.gruende[i].text}`);
	if (a1 !== null) await say(r.gruendeSelbst ? `Davon hattest du ${r.gruendeSelbst} selbst. +1 Punkt 💪` : 'Jetzt kennst du sie. Beim nächsten Mal bist du schneller.');

	// Prüf-Runde
	await note('— KI-Check —');
	await say('Eine KI hat den Fall zusammengefasst. Ein Satz stimmt nicht. Findest du ihn?');
	for (let i = 0; i < k.pruef.length; i++) await say(`${NUM[i]} ${k.pruef[i].satz}`);
	const falschIdx = k.pruef.findIndex(p => p.falsch);
	r.fehlerGefunden = false;
	for (let versuch = 0; versuch < 2 && !r.fehlerGefunden; versuch++) {
		const p = await choose(k.pruef.map((_, i) => NUM[i]));
		if (NUM.indexOf(p) === falschIdx) {
			r.fehlerGefunden = true;
			r.fehlerVersuch = versuch + 1;
			await say((versuch === 0 ? 'Erwischt! +1 Punkt. ' : 'Jetzt hast du ihn. ') + k.pruef[falschIdx].korrektur);
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
	const m1 = await ask('Erklär’s Malia …', 'Zwei, drei Sätze. Keine Fachwörter.', 'Heute überspringen');
	r.malia = null;
	if (m1 === null) {
		await say('Schade. Dann frag ich nächstes Mal. 🙂', 'malia');
	} else {
		const tm = txt => k.malia.punkte.map(p => p.worte.some(w => kommtVor(txt, w)));
		let h = tm(m1);
		const fehlt = h.indexOf(false);
		await say(fehlt >= 0 ? k.malia.punkte[fehlt].nachfrage : k.malia.allesDrin, 'malia');
		const m2 = await ask('Antwort an Malia …', '', 'Überspringen');
		h = tm(m1 + ' ' + (m2 || ''));
		r.malia = h.filter(Boolean).length;
		const verstanden = r.malia >= Math.min(2, h.length);
		await say(verstanden ? k.malia.verstanden : k.malia.halb, 'malia');
		await say('Kurzer Check deiner Erklärung:\n' + k.malia.punkte.map((p, i) => (h[i] ? '✓ ' : '○ ') + p.name).join('\n') + (verstanden ? '\n+1 Punkt' : ''));
	}

	// Ergebnis
	r.punkte = punkteFuer(r);
	await note('— Ergebnis —', 700);
	const text2 = shareText(r);
	await say(text2, 'ki', 'card');
	if (zaehlt) {
		r.datum = iso(today());
		r.zeit = Date.now();
		r.share = text2;
		state.gespielt[k.id] = r;
		save();
		zeigePunkte();
		await say('In ein paar Tagen frag ich dich nochmal kurz danach. Mal sehen, ob’s hängen bleibt. 😉');
	} else {
		await say('Das war eine Wiederholung, sie zählt nicht.');
	}
	await nachRunde(k);
}

// ---------- Fehlerjagd aus den letzten sechs Fällen ----------
function faelligeFehlerjagd() {
	const schon = new Set(state.fehlerjagden.flatMap(f => f.ids));
	const neu = gespielteListe().filter(r => !schon.has(r.id) && karteVon(r.id));
	return neu.length >= 6 ? neu.slice(0, 6).map(r => karteVon(r.id)) : null;
}
async function spieleFehlerjagd(karten) {
	await note('— Fehlerjagd —', 800);
	await say('Zwischendurch eine Fehlerjagd! 🔍 Ich fasse deine letzten sechs Fälle zusammen.');
	await say('Drei Sätze stimmen nicht. Tipp sie an, du kannst eine Markierung auch wieder lösen. Wenn du sicher bist: „Fertig“.');
	const falschBei = new Set(shuffle(karten.map(k => k.id), 'fj' + Date.now()).slice(0, 3));
	const aussagen = shuffle(karten.map(k => {
		const f = k.pruef.find(p => p.falsch);
		const w = k.pruef.filter(p => !p.falsch);
		return falschBei.has(k.id)
			? { satz: f.satz, falsch: true, korrektur: f.korrektur, titel: k.titel }
			: { satz: w[Math.floor(Math.random() * w.length)].satz, falsch: false, titel: k.titel };
	}), 'reihe' + Date.now());
	const blasen = [];
	for (let i = 0; i < aussagen.length; i++) {
		const b = await say(`${NUM[i]} ${aussagen[i].satz}`, 'ki', 'selectable');
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
	await note('— Auflösung —', 1100);
	let gefunden = 0, falschVerdacht = 0;
	for (let i = 0; i < aussagen.length; i++) {
		const a = aussagen[i];
		const sel = blasen[i].classList.contains('selected');
		if (a.falsch && sel) { gefunden++; await say(`${NUM[i]} Gefunden! ${a.korrektur} (${a.titel})`); }
		else if (a.falsch) await say(`${NUM[i]} Übersehen. ${a.korrektur} (${a.titel})`);
		else if (sel) { falschVerdacht++; await say(`${NUM[i]} stimmt. Fast-richtig fühlt sich manchmal falsch an.`); }
	}
	await say(`${gefunden} von 3 Fehlern gefunden. +${gefunden} Punkt${gefunden === 1 ? '' : 'e'}. Genau so klingen KI-Zusammenfassungen: flüssig, selbstbewusst und hier und da falsch.`);
	state.fehlerjagden.push({ datum: iso(today()), ids: karten.map(k => k.id), gefunden, falschVerdacht });
	save();
	zeigePunkte();
}

// ---------- Ergebnis und Teilen ----------
function shareText(r) {
	const link = TEST ? '' : '\n' + location.origin + location.pathname;
	return [`${NAME} · Fall gelöst`,
		`Hinweise ${'●'.repeat(r.hinweise)}${'○'.repeat(3 - r.hinweise)}`,
		`${r.richtig ? '✓ richtig' : '✗ daneben'} · ${r.sicherheit} % sicher`,
		`${r.fehlerGefunden ? '✓' : '✗'} KI-Fehler`,
		r.malia === null ? null : `${r.malia >= 2 ? '✓' : '○'} Malia erklärt`,
		`+${r.punkte} Punkte`
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
async function nachRunde(k) {
	while (true) {
		const opts = [];
		if (offeneFaelle().length) opts.push('Nächster Fall 🎲');
		opts.push('Ergebnis teilen');
		if (k.quellen && k.quellen.length) opts.push('Quellen');
		opts.push('Meine Fälle');
		const w = await choose(opts, { primary: ['Nächster Fall 🎲'], quiet: ['Meine Fälle'] });
		if (w === 'Nächster Fall 🎲') return neueRunde();
		if (w === 'Ergebnis teilen') await teilen((state.gespielt[k.id] || {}).share || [...chat.querySelectorAll('.card')].pop()?.textContent || '');
		if (w === 'Quellen') await sayLinks('Woher ich das weiß:', k.quellen);
		if (w === 'Meine Fälle') openSheet();
	}
}

// ---------- Übersicht „Meine Fälle“ und Hilfe ----------
function statistik() {
	const g = gespielteListe();
	const abrufe = g.flatMap(r => r.abrufe || []);
	const kal = {};
	g.forEach(r => { kal[r.sicherheit] = kal[r.sicherheit] || [0, 0]; kal[r.sicherheit][1]++; if (r.richtig) kal[r.sicherheit][0]++; });
	return {
		gespielt: g.length,
		richtig: g.filter(r => r.richtig).length,
		abrufRichtig: abrufe.filter(a => a.richtig).length,
		abrufe: abrufe.length,
		fehler: g.filter(r => r.fehlerGefunden).length + state.fehlerjagden.reduce((s, f) => s + f.gefunden, 0),
		fehlerMoeglich: g.length + state.fehlerjagden.length * 3,
		kal
	};
}
const HILFE = `<h2>So funktioniert’s</h2>
<p><b>Worum geht’s?</b> KI nimmt uns viel Denken ab. Hier trainierst du es wieder: Du knackst kurze Fälle ${MUSIK ? 'rund um Musik (Geschichte, einfache Theorie, Songwriting, Studio, Musikbusiness)' : 'aus Geschichte, Alltag, Wissenschaft und Philosophie'} selbst, statt dir die Antwort sagen zu lassen.</p>
<p><b>Warum bleibt das hängen?</b> Erst raten, dann die Auflösung; selbst begründen; es jemandem erklären; Tage später noch einmal erinnern. Das sind die Dinge, die laut Lernforschung am besten wirken. Jeder Fall nutzt sie alle.</p>
<p><b>Punkte:</b> Lösung ohne Hinweis 3, mit jedem Hinweis einer weniger. Je 1 Punkt fürs Warum, für den gefundenen KI-Fehler und wenn Malia es verstanden hat. Spätere Erinnerungsfragen und Fehlerjagden bringen Extrapunkte.</p>
<p><b>Dein Spielstand</b> bleibt auf diesem Gerät. Es gibt kein Konto und keine Werbung.</p>`
	+ (MUSIK ? '<p><b>Mehr Fälle:</b> Neben Musik gibt es Fälle aus Geschichte, Alltag, Wissenschaft und Philosophie: <a href="../">erstdenken</a>. Dort zählt ein eigener Spielstand.</p>' : '');
function openSheet(nurHilfe = false) {
	let html = '';
	if (!nurHilfe) {
		const s = statistik();
		html += `<h2>Deine Bilanz</h2><p>${s.gespielt} von ${FAELLE.length} Fällen gespielt</p>`;
		html += '<div class="stats">'
			+ `<div class="stat"><b>${gesamtPunkte()}</b><span>Punkte</span></div>`
			+ `<div class="stat"><b>${s.gespielt ? s.richtig + '/' + s.gespielt : '–'}</b><span>Fälle richtig gelöst</span></div>`
			+ `<div class="stat"><b>${s.abrufe ? s.abrufRichtig + '/' + s.abrufe : '–'}</b><span>später noch gewusst</span></div>`
			+ `<div class="stat"><b>${s.fehlerMoeglich ? s.fehler + '/' + s.fehlerMoeglich : '–'}</b><span>KI-Fehler gefunden</span></div>`
			+ '</div>';
		const kalText = [50, 70, 90].filter(p => s.kal[p]).map(p => `bei ${p} % sicher: ${s.kal[p][0]} von ${s.kal[p][1]} richtig`).join(' · ');
		if (kalText) html += `<p>Wie gut passt dein Bauchgefühl? ${kalText}</p>`;
		if (offeneFaelle().length) html += '<button class="chip primary" id="zufallBtn" style="margin:0 0 12px">Nächster Fall 🎲</button>';
		html += '<h2 style="margin-top:20px">Alle Fälle</h2><p>Gelöste Fälle kannst du nochmal ansehen, offene bleiben eine Überraschung.</p>';
		gespielteListe().forEach(r => {
			html += `<button class="day" data-fall="${r.id}"><span class="day__nr">✓</span><span class="day__title">${r.titel}</span><span class="day__state">+${r.punkte || 0}</span></button>`;
		});
		const offen = offeneFaelle().length;
		if (offen) html += `<div class="day" style="cursor:default"><span class="day__nr">○</span><span class="day__title">${offen} Fälle warten noch</span><span class="day__state"></span></div>`;
		html += '<div style="margin-top:32px"></div>';
	}
	html += HILFE + '<p style="margin-top:24px"><button class="skip" id="closeSheet" style="display:inline;margin:0">Zurück zum Chat</button></p>';
	sheetInner.innerHTML = html;
	sheetInner.querySelectorAll('[data-fall]').forEach(b => b.onclick = () => goFall(b.dataset.fall));
	document.getElementById('closeSheet').onclick = closeSheet;
	const zb = document.getElementById('zufallBtn');
	if (zb) zb.onclick = () => { closeSheet(); neueRunde(); };
	sheet.classList.add('open');
	sheet.scrollTop = 0;
	document.getElementById('daysBtn').textContent = 'Chat';
}
function closeSheet() { sheet.classList.remove('open'); document.getElementById('daysBtn').textContent = 'Fälle'; }
document.getElementById('daysBtn').onclick = () => sheet.classList.contains('open') ? closeSheet() : openSheet();
document.getElementById('helpBtn').onclick = () => sheet.classList.contains('open') ? closeSheet() : openSheet(true);
function goFall(id) {
	const p = new URLSearchParams();
	if (TEST) p.set('test', '');
	p.set('fall', id);
	location.search = p.toString().replace(/=(&|$)/g, '$1');
}

// ---------- Ablauf ----------
let laeuft = false;
async function neueRunde() {
	if (laeuft) { chat.innerHTML = ''; lastLeft = null; window.scrollTo(0, 0); }
	laeuft = true;
	const fj = faelligeFehlerjagd();
	if (fj) {
		await say('Bevor’s weitergeht: Zeit für eine Fehlerjagd über deine letzten sechs Fälle. Bringt bis zu 3 Extrapunkte.');
		const w = await choose(['Los geht’s', 'Lieber gleich ein neuer Fall'], { quiet: ['Lieber gleich ein neuer Fall'] });
		if (w === 'Los geht’s') {
			await spieleFehlerjagd(fj);
			if (!offeneFaelle().length) return alleGeloest();
			await choose(['Nächster Fall 🎲'], { primary: ['Nächster Fall 🎲'] });
			chat.innerHTML = ''; lastLeft = null; window.scrollTo(0, 0);
		}
	}
	const k = zufallsFall();
	if (!k) return alleGeloest();
	await spieleFall(k, true);
}
async function alleGeloest() {
	await say(`Wow: Du hast alle ${FAELLE.length} Fälle gelöst! 🙌 Neue sind in Arbeit.`);
	await say('Bis dahin kannst du unter „Fälle“ jeden nochmal ansehen.');
	await choose(['Meine Fälle']);
	openSheet();
}
async function zeigeGespielt(k) {
	const r = state.gespielt[k.id];
	await say(`„${k.titel}“ hast du schon gelöst. ✓`);
	await say(r.share, 'ki', 'card');
	const w = await choose(['Nochmal spielen (zählt nicht)', 'Nächster Fall 🎲', 'Meine Fälle'], { quiet: ['Meine Fälle'] });
	if (w === 'Meine Fälle') { openSheet(); return zeigeGespielt(k); }
	chat.innerHTML = ''; lastLeft = null;
	if (w === 'Nächster Fall 🎲') return neueRunde();
	laeuft = true;
	await spieleFall(k, false);
}

(async function main() {
	zeigePunkte();
	const wunsch = karteVon(params.get('fall') || '');
	if (wunsch) {
		laeuft = true;
		if (state.gespielt[wunsch.id]) return zeigeGespielt(wunsch);
		return spieleFall(wunsch, true);
	}
	if (!state.intro) {
		await intro();
		chat.innerHTML = ''; lastLeft = null;
	} else {
		await say(gespielteListe().length ? pick(['Schön, dass du wieder da bist! 👋', 'Da bist du ja wieder. 👋', 'Willkommen zurück! 👋']) : 'Hallo! 👋');
		await abruf();
	}
	laeuft = true;
	await neueRunde();
})();

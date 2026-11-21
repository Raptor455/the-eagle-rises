/* ===== MENU PRINCIPAL =====
   Indépendant de main.js : il crée sa propre fenêtre et pilote le jeu par les boutons existants
   (pause = bouton [data-v="0"], reprise = la vitesse choisie avant l'ouverture). Échap l'ouvre et le ferme. */
const css = `
#menu{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(14,16,22,.55);backdrop-filter:blur(3px)}
#menu.cache{display:none}
#menu .cadre{min-width:300px;max-width:420px;text-align:center;background:rgba(24,28,36,.92);border:1px solid #8c7a4c;border-radius:6px;padding:28px 34px 22px}
#menu h1{margin:0 0 2px;font-size:34px;letter-spacing:1px;color:#f5d98a;font-weight:normal}
#menu .sous{font-size:13px;opacity:.8;margin-bottom:22px}
#menu button{display:block;width:100%;margin:8px 0;padding:9px 12px;font-size:16px}
#menu .bataille{font-size:12.5px;opacity:.75;margin-top:16px;line-height:1.5}
#m-recommencer.cache{display:none}`;
document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
document.body.insertAdjacentHTML('afterbegin', `<div id="menu"><div class="cadre">
<h1>The Eagle Rises</h1><div class="sous">Batailles napoléoniennes</div>
<button id="m-jouer">Jouer : Pratzen, 2 décembre 1805</button>
<button id="m-recommencer" class="cache">Recommencer la bataille</button>
<button id="m-touches">Commandes</button>
<button id="m-quitter">Quitter</button>
<div class="bataille">Vous commandez l'armée française.<br>Échap : revenir à ce menu.</div></div></div>`);

const menu = document.getElementById('menu'), $ = id => document.getElementById(id);
const appli = !!window.eagle; // lancé depuis le .exe (voir appli/main.js)
if (!appli) $('m-quitter').style.display = 'none'; // un navigateur ne laisse pas une page se fermer seule
let vitesse = '1', commence = false;
window.eagle?.etatMaj?.().then(s => menu.querySelector('.cadre').insertAdjacentHTML('beforeend',
  `<div class="bataille" style="opacity:.5;margin-top:8px">Jeu ${s}</div>`));

function ouvrir() {
  const on = document.querySelector('[data-v].on'); if (on) vitesse = on.dataset.v;
  document.querySelector('[data-v="0"]')?.click();
  menu.classList.remove('cache');
}
function fermer() {
  menu.classList.add('cache');
  document.querySelector(`[data-v="${vitesse === '0' ? '1' : vitesse}"]`)?.click();
  if (!commence) { commence = true; $('m-jouer').textContent = 'Reprendre'; $('m-recommencer').classList.remove('cache'); }
}
$('m-jouer').onclick = fermer;
$('m-recommencer').onclick = () => location.reload();
$('m-touches').onclick = () => { $('touches')?.classList.remove('cache'); fermer(); };
$('m-quitter').onclick = () => window.eagle ? window.eagle.quitter() : window.close();

// Tant que le menu est ouvert, le clavier ne commande ni la caméra ni le jeu.
document.addEventListener('keydown', e => {
  if (e.code === 'Escape') { e.preventDefault(); menu.classList.contains('cache') ? ouvrir() : fermer(); return; }
  if (!menu.classList.contains('cache')) e.stopPropagation();
}, true);
for (const t of ['wheel', 'pointerdown', 'mousedown', 'contextmenu'])
  document.addEventListener(t, e => { if (!menu.classList.contains('cache') && !e.target.closest?.('#menu button')) e.stopPropagation(); }, true);

// Le jeu se lance juste après ce fichier et remet la vitesse à ×1 : on le met en pause ensuite.
setTimeout(ouvrir, 0);

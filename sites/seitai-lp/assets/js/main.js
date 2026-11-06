// 余白日和 整体室（架空・練習作品）
// メニュー（スマホ）と「予約について（デモ）」の案内。本当の予約・送信・電話はしない。

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const spMedia = window.matchMedia("(max-width: 959px)");

// ---------- メニュー（スマホ） ----------
const nav = document.querySelector(".global-nav");
const menuButton = nav.querySelector(".menu-button");

function setMenu(open, { returnFocus = false } = {}) {
  nav.classList.toggle("is-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
  if (!open && returnFocus) menuButton.focus();
}

menuButton.addEventListener("click", () => {
  setMenu(!nav.classList.contains("is-open"));
});

nav.querySelectorAll(".global-nav__list a").forEach((link) => {
  link.addEventListener("click", () => setMenu(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && nav.classList.contains("is-open")) {
    setMenu(false, { returnFocus: true });
  }
});

// パソコンの幅に戻ったら、開いたままにしない
spMedia.addEventListener("change", (event) => {
  if (!event.matches) setMenu(false);
});

// ---------- スマホの下の固定ボタン ----------
// 最初の画面では出さず、受付時間のカードの下端が、ボタンの並ぶ高さより上まで来たら出す。
// （カードがボタンの後ろに隠れないようにするため。パソコンでは CSS で出さない）
const spCta = document.querySelector(".sp-cta");
const ctaTrigger = document.querySelector(".sp-cta-trigger");
const CTA_MARGIN = 12;
let ctaTicking = false;

function updateCta() {
  ctaTicking = false;
  const barTop = spCta.offsetTop - CTA_MARGIN;
  spCta.classList.toggle("is-visible", ctaTrigger.getBoundingClientRect().top <= barTop);
}

function requestCtaUpdate() {
  if (ctaTicking) return;
  ctaTicking = true;
  requestAnimationFrame(updateCta);
}

window.addEventListener("scroll", requestCtaUpdate, { passive: true });
window.addEventListener("resize", requestCtaUpdate);
updateCta();

// ---------- 予約について（デモ） ----------
const dialog = document.getElementById("demo-dialog");
let opener = null;

function openDemo(button) {
  opener = button;
  dialog.classList.remove("is-closing");
  dialog.showModal();
}

function closeDemo() {
  if (!dialog.open) return;
  const finish = () => {
    dialog.classList.remove("is-closing");
    dialog.close();
    if (opener) opener.focus();
  };
  if (reduceMotion.matches) {
    finish();
    return;
  }
  dialog.classList.add("is-closing");
  setTimeout(finish, 160);
}

document.querySelectorAll("[data-demo-open]").forEach((button) => {
  button.addEventListener("click", () => openDemo(button));
});

dialog.querySelector("[data-demo-close]").addEventListener("click", closeDemo);

// Esc キー：ブラウザの閉じ方ではなく、同じ閉じ方（フォーカスを戻す）にそろえる
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDemo();
});

// 案内の外（薄い墨色のところ）を押したら閉じる。案内の中を押しても閉じない
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeDemo();
});

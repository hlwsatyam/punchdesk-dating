// Punch Desk landing — interactive polish.

const BACKEND_URL =
  (window.PUNCH_DESK_BACKEND_URL || "").replace(/\/$/, "") ||
  "https://gay-dating-engine.preview.emergentagent.com";

/* ---------- Stars ---------- */
(function makeStars() {
  const layer = document.getElementById("stars");
  if (!layer) return;
  const count = window.innerWidth < 720 ? 40 : 90;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("span");
    dot.className = "star" + (Math.random() > 0.85 ? " big" : "");
    dot.style.left = Math.random() * 100 + "%";
    dot.style.top = Math.random() * 100 + "%";
    dot.style.animationDelay = Math.random() * 4 + "s";
    layer.appendChild(dot);
  }
})();

/* ---------- Phone renderers ---------- */
const VIEWS = {
  discover: () => `
    <div class="phone-screen">
      <div class="pd-top-bar">
        <div class="brand">PUNCH DESK</div>
        <div class="pd-radius">📍 25 km</div>
      </div>
      <div class="pd-eyebrow">NEARBY, FOR REAL</div>
      <div class="pd-title">Discover your next hello.</div>
      <div class="pd-card">
        <div class="pd-card-figure"></div>
        <div class="pd-card-glow"></div>
        <div class="pd-card-body">
          <div class="pd-name-row"><div class="pd-name">Aarav, 27</div><span class="pd-verified">✓</span></div>
          <div class="pd-meta">📍 2.4 km · Online now</div>
          <div class="pd-tags"><span class="pd-tag">Coffee</span><span class="pd-tag">Design</span><span class="pd-tag">Travel</span></div>
        </div>
      </div>
      <div class="pd-actions">
        <div class="pd-btn pass">✕</div>
        <div class="pd-btn like">♥</div>
      </div>
    </div>`,
  match: () => `
    <div class="phone-screen">
      <div class="pd-top-bar"><div class="brand">PUNCH DESK</div><div></div></div>
      <div class="pd-match-hero"><div class="heart" style="font-size:36px;">♥</div></div>
      <div style="text-align:center; margin-top:14px;"><div class="pd-eyebrow" style="letter-spacing:3px;">IT'S A MATCH</div></div>
      <div class="pd-match-title">You &amp; Aarav</div>
      <div class="pd-match-sub">You both like these things — a great place to start.</div>
      <div class="pd-match-chips"><span>Coffee</span><span>Design</span><span>Travel</span></div>
      <div class="pd-match-btn">Say hello →</div>
    </div>`,
  chat: () => `
    <div class="phone-screen">
      <div class="pd-chat-header">
        <div style="width:32px;height:32px;border-radius:16px;background:#16181D;display:flex;align-items:center;justify-content:center;">←</div>
        <div class="pd-avatar"></div>
        <div>
          <div class="pd-chat-name">Aarav</div>
          <div class="pd-chat-status">● Online</div>
        </div>
      </div>
      <div class="pd-chat-list">
        <div class="pd-bubble left">Hey! Loved your photos ✨</div>
        <div class="pd-bubble right">Aww thanks. Coffee this weekend?</div>
        <div class="pd-bubble left">Yes! I know a rooftop spot.</div>
        <div class="pd-bubble right">Sold. Saturday, 5pm?</div>
        <div class="pd-typing"><span></span><span></span><span></span></div>
      </div>
      <div class="pd-composer">
        <div class="input">Type a message</div>
        <div class="send">↑</div>
      </div>
    </div>`,
  premium: () => `
    <div class="phone-screen">
      <div class="pd-top-bar"><div class="brand">PUNCH DESK</div><div></div></div>
      <div class="pd-eyebrow" style="text-align:center;">MEMBERSHIP</div>
      <div class="pd-premium-hero">
        <div class="pd-premium-crown" style="font-size:34px; color:#D4AF37;">♛</div>
        <div class="pd-price">₹799<small>/ month</small></div>
      </div>
      <div class="pd-plan-list">
        <div>Priority discovery</div>
        <div>Unlimited likes</div>
        <div>Verified gold badge</div>
        <div>Read receipts everywhere</div>
      </div>
      <div class="pd-cta">Go Premium</div>
    </div>`,
  requests: () => `
    <div class="phone-screen">
      <div class="pd-top-bar"><div class="brand">PUNCH DESK</div><div></div></div>
      <div class="pd-eyebrow">INCOMING</div>
      <div class="pd-title">Photo requests.</div>
      <div class="pd-req-item">
        <div class="av"></div>
        <div class="body"><div class="n">Rohan</div><div class="p">wants to see your private set</div></div>
        <div class="decide"><div class="no">No</div><div class="yes">Allow</div></div>
      </div>
      <div class="pd-req-item">
        <div class="av" style="background:linear-gradient(135deg,#22D3EE,#8B5CF6)"></div>
        <div class="body"><div class="n">Karan</div><div class="p">wants to see your private set</div></div>
        <div class="decide"><div class="no">No</div><div class="yes">Allow</div></div>
      </div>
      <div class="pd-req-item">
        <div class="av" style="background:linear-gradient(135deg,#F59E0B,#D4AF37)"></div>
        <div class="body"><div class="n">Vivek</div><div class="p">respectful request, verified</div></div>
        <div class="decide"><div class="no">No</div><div class="yes">Allow</div></div>
      </div>
      <div style="margin-top:16px; text-align:center; font-size:11px; color:#8A8F9D;">Private by default. Approve one person at a time.</div>
    </div>`,
};

function paintPhones() {
  document.querySelectorAll(".phone").forEach((el) => {
    const mode = el.dataset.mode || "discover";
    el.innerHTML = VIEWS[mode] ? VIEWS[mode]() : VIEWS.discover();
  });
}
paintPhones();

/* ---------- Mode switcher ---------- */
const modeBar = document.getElementById("mode-switcher");
if (modeBar) {
  modeBar.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-mode]");
    if (!btn) return;
    modeBar.querySelectorAll("button").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const phone = document.getElementById("showcase-phone");
    phone.dataset.mode = btn.dataset.mode;
    phone.innerHTML = VIEWS[btn.dataset.mode]();
  });
}

/* ---------- FAQ ---------- */
const FAQ = [
  {
    q: "Is Punch Desk free to use?",
    a: "Yes. Nearby discovery, matching, and unlimited chat are free forever. Premium unlocks priority discovery and expressive tools.",
  },
  {
    q: "How is my privacy protected?",
    a: "We never share your exact coordinates. Discovery uses approximate distance only, and private photos require your explicit approval per person.",
  },
  {
    q: "Can I use the same app for a different community?",
    a: "The whole platform is configuration-driven. Admins can switch dating modes, categories, and copy without shipping new code.",
  },
  {
    q: "Which cities are you live in?",
    a: "Early access is rolling out across major Indian metros. Join the waitlist and we'll send you a personal link.",
  },
  {
    q: "How do notifications work?",
    a: "Real-time push via Firebase, deep-linked directly to the exact chat or match — so no more hunting through your inbox.",
  },
];
const faqList = document.getElementById("faq-list");
if (faqList) {
  FAQ.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "faq-item";
    wrapper.innerHTML = `<div class="faq-q"><span>${item.q}</span><span class="plus">＋</span></div><div class="faq-a"><p style="padding-top: 14px;">${item.a}</p></div>`;
    wrapper.querySelector(".faq-q").addEventListener("click", () => wrapper.classList.toggle("open"));
    faqList.appendChild(wrapper);
  });
}

/* ---------- Waitlist ---------- */
const form = document.getElementById("waitlist");
if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const [input, button] = form.elements;
    const phone = input.value.trim();
    if (!phone) return;
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = await response.json().catch(() => ({}));
      const msg = document.getElementById("waitlist-msg");
      if (!response.ok) {
        msg.textContent = payload.detail || "That number could not be added right now.";
      } else if (payload.demoCode) {
        msg.textContent = `You're in. Demo code just for this preview: ${payload.demoCode}. Open the Punch Desk app to continue.`;
      } else {
        msg.textContent = "You're on the list. We'll text you the moment you're in.";
      }
    } catch (error) {
      document.getElementById("waitlist-msg").textContent = "Network error. Please try again.";
    } finally {
      button.disabled = false;
      button.textContent = "Join waitlist";
    }
  });
}

/* ---------- Smooth scroll ---------- */
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (event) => {
    const target = document.querySelector(anchor.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

/** Kiểu giao diện chung: tông ấm dịu, chữ to, nút lớn dễ bấm trên điện thoại. */
export const STYLES = `
:root{--bg:#f4efe6;--card:#fffdf8;--ink:#2b2b2b;--muted:#6b6b6b;--accent:#2e7d6b;--accent-ink:#fff;--line:#e8e1d5;--warn:#b35c00}
#ui{position:fixed;inset:0;pointer-events:none;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink)}
#ui > *{pointer-events:auto}
.bvo-screen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(244,239,230,.92);overflow:auto}
.bvo-card{background:var(--card);border-radius:18px;box-shadow:0 8px 30px rgba(0,0,0,.08);padding:24px 20px;width:min(520px,100%);max-height:100%;overflow:auto}
.bvo-card h1{font-size:24px;margin:0 0 8px}.bvo-card h2{font-size:20px;margin:0 0 12px}
.bvo-muted{color:var(--muted);font-size:14px}
.bvo-btn{display:block;width:100%;border:0;border-radius:12px;padding:14px 16px;margin:10px 0;font:inherit;font-weight:600;cursor:pointer;background:var(--accent);color:var(--accent-ink)}
.bvo-btn.secondary{background:#ebe5da;color:var(--ink)}.bvo-btn.danger{background:#fbe4e0;color:#a33}
.bvo-btn:disabled{opacity:.5;cursor:default}
.bvo-row{display:flex;gap:8px;flex-wrap:wrap}.bvo-row > .bvo-btn{flex:1;min-width:120px}
.bvo-check{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}
.bvo-check input{width:22px;height:22px;flex:none;margin-top:2px}
.bvo-field{display:block;margin:14px 0}.bvo-field > span{display:block;font-weight:600;margin-bottom:6px}
.bvo-input{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:10px;padding:12px;font:inherit;background:#fff}
.bvo-chips{display:flex;gap:8px;flex-wrap:wrap}
.bvo-chip{border:2px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font:inherit;cursor:pointer}
.bvo-chip[aria-pressed=true]{border-color:var(--accent);background:#e6f2ef}
.bvo-swatch{width:34px;height:34px;border-radius:50%;padding:0}
.bvo-error{color:#a33;font-size:14px;min-height:20px}
.bvo-section{margin:12px 0}.bvo-section h3{font-size:16px;margin:0 0 4px}
.bvo-hud{position:absolute;left:16px;right:16px;top:calc(12px + env(safe-area-inset-top));display:flex;gap:8px;justify-content:space-between;align-items:center}
.bvo-pill{background:rgba(255,253,248,.92);border-radius:999px;padding:8px 14px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.bvo-hud .bvo-btn{width:auto;margin:0;padding:10px 14px}
.bvo-dock{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom))}
.bvo-dock .bvo-btn{width:auto;padding:14px 22px;box-shadow:0 4px 14px rgba(0,0,0,.15)}
.bvo-panel{position:absolute;right:0;top:0;bottom:0;width:min(440px,100%);background:var(--card);box-shadow:-6px 0 24px rgba(0,0,0,.12);display:flex;flex-direction:column}
.bvo-panel header{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--line)}
.bvo-panel header h2{flex:1;font-size:17px;margin:0}
.bvo-panel .bvo-x{background:none;border:0;font-size:22px;cursor:pointer;padding:4px 8px}
.bvo-msgs{flex:1;overflow:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px}
.bvo-msg{max-width:85%;padding:10px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}
.bvo-msg.user{align-self:flex-end;background:#dcefe9}
.bvo-msg.doctor,.bvo-msg.safety{align-self:flex-start;background:#f1ece4}
.bvo-msg.safety{border:2px solid #e3b3a8;background:#fff6f3}
.bvo-ai{display:inline-block;font-size:11px;font-weight:700;background:#2b2b2b;color:#fff;border-radius:6px;padding:1px 6px;margin-right:6px;vertical-align:1px}
.bvo-res{margin-top:8px;font-size:14px}.bvo-res a{color:var(--accent);font-weight:600}
/* Chừa 72px dưới cùng cho nút "Cần giúp đỡ ngay" (luôn hiện, không được che nút khác). */
.bvo-compose{display:flex;gap:8px;padding:10px 12px calc(72px + env(safe-area-inset-bottom));border-top:1px solid var(--line)}
.bvo-compose textarea{flex:1;resize:none;height:44px;max-height:120px}
.bvo-compose .bvo-btn{width:auto;margin:0}
.bvo-doctors{padding:12px 16px calc(80px + env(safe-area-inset-bottom));overflow:auto}
.bvo-doctor{display:block;width:100%;text-align:left;border:1px solid var(--line);background:#fff;border-radius:14px;padding:12px;margin:8px 0;cursor:pointer;font:inherit}
.bvo-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#2b2b2b;color:#fff;padding:10px 16px;border-radius:10px;z-index:2147482000}
.bvo-tag{display:inline-block;font-size:12px;font-weight:600;background:#e6f2ef;color:var(--accent);border-radius:6px;padding:1px 6px;vertical-align:1px}
.bvo-circle-chat{width:min(380px,100%)}
.bvo-circle-chat .bvo-compose{padding-bottom:calc(72px + env(safe-area-inset-bottom))}
.bvo-circle-dock{left:16px;transform:none}
.bvo-msg{position:relative}.bvo-msg.pending{opacity:.55}.bvo-msg.rejected{background:#fbe4e0}.bvo-msg.rejected > span{text-decoration:line-through}
.bvo-msg.rejected .bvo-muted{text-decoration:none}
.bvo-nick{display:block;font-size:13px;margin-bottom:2px}
.bvo-msg.facilitator{border:2px solid #cfe3dd}
.bvo-system{align-self:center;font-size:13px;color:var(--muted);text-align:center}
.bvo-more{position:absolute;top:4px;right:4px;border:0;background:none;font-size:18px;line-height:1;cursor:pointer;padding:2px 6px;color:var(--muted)}
.bvo-msg.doctor{padding-right:30px}
.bvo-pop{position:absolute;right:0;top:28px;z-index:5;background:var(--card);border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);padding:6px;min-width:180px}
.bvo-pop .bvo-btn{margin:4px 0;padding:10px 12px;text-align:left}
.bvo-thank{border:0;background:none;cursor:pointer;font-size:15px;padding:2px 4px;margin-top:2px}.bvo-thank:disabled{opacity:.4}
.bvo-thanks{display:inline-block;font-size:12px;color:var(--muted);margin-left:6px}
.bvo-announce{position:absolute;left:50%;transform:translateX(-50%);top:calc(64px + env(safe-area-inset-top));max-width:min(560px,calc(100% - 32px));background:#fff8e1;border:2px solid #f6d186;border-radius:14px;padding:10px 40px 10px 14px;box-shadow:0 4px 14px rgba(0,0,0,.12);font-weight:600}
.bvo-announce .bvo-x{position:absolute;right:4px;top:4px;background:none;border:0;font-size:20px;cursor:pointer}
.bvo-quest.voted{border:2px solid var(--accent)}
.bvo-chip input{vertical-align:-2px}
.bvo-qh{font-size:15px;margin:16px 0 6px}
.bvo-qhead{padding:4px 0 8px}.bvo-rank{font-size:18px;font-weight:700}
.bvo-rest{margin-top:6px;background:#e6f2ef;border-radius:10px;padding:8px 10px;font-size:14px}
.bvo-next{border:2px solid #cfe3dd;border-radius:14px;padding:12px;margin:8px 0;background:#f7fbfa}
.bvo-req{margin:8px 0;font-size:14px}
.bvo-bar{height:8px;border-radius:999px;background:#ebe5da;overflow:hidden;margin-top:4px}.bvo-bar span{display:block;height:100%;background:var(--accent)}
.bvo-quest{border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin:8px 0;background:#fff}
.bvo-quest.done{opacity:.6}.bvo-quest .bvo-row{margin-top:8px;align-items:center}.bvo-quest .bvo-btn{margin:0}
.bvo-quest .bvo-input{flex:1;min-width:140px}
.bvo-qtitle{font-weight:700;display:flex;justify-content:space-between;gap:8px}
.bvo-breath-circle{width:160px;height:160px;margin:20px auto;border-radius:50%;background:radial-gradient(circle,#cfe3dd,#8fc1b5);transition:transform .1s linear}
.bvo-breath-phase{font-size:20px;font-weight:700}
.bvo-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.bvo-confetti i{position:absolute;top:-12px;width:8px;height:14px;border-radius:2px;animation:bvo-fall 2.6s linear forwards}
@keyframes bvo-fall{to{transform:translateY(110vh) rotate(540deg)}}
@media (prefers-reduced-motion:reduce){.bvo-confetti{display:none}.bvo-breath-circle{transition:none}}
@media (max-width:600px){.bvo-panel{width:100%}
.bvo-circle-chat{top:auto;height:48%;width:100%;border-radius:16px 16px 0 0}
.bvo-circle-dock{bottom:calc(48% + 8px);left:8px;right:8px}
.bvo-circle-dock .bvo-btn{padding:10px 12px;font-size:14px;white-space:nowrap;min-width:0}}
`;

export function injectStyles() {
  const s = document.createElement("style");
  s.textContent = STYLES;
  document.head.append(s);
}

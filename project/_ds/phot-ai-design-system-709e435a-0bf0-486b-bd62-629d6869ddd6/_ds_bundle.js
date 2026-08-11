/* @ds-bundle: {"format":3,"namespace":"PhotAIDesignSystem_709e43","components":[],"sourceHashes":{"Modals.jsx":"b58fadd1f3be","frames/design-canvas.jsx":"5d0e39003628","ui_kits/ai-angles/AdIntelScreen.jsx":"d0e7eb8fbdae","ui_kits/ai-angles/AngleLabsScreen.jsx":"7f970cb78856","ui_kits/ai-angles/App.jsx":"e5497e2d1a86","ui_kits/ai-angles/BrandScreen.jsx":"b6601d09fc21","ui_kits/ai-angles/HomeScreen.jsx":"2f465e48d2b3","ui_kits/ai-angles/Sidebar.jsx":"f2e0a0b511a5","ui_kits/ai-angles/TopBar.jsx":"031ba94f25ae","ui_kits/ai-angles/components.jsx":"1a746ea2dcf2"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.PhotAIDesignSystem_709e43 = window.PhotAIDesignSystem_709e43 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// Modals.jsx
try { (() => {
/* global React */
const {
  useState
} = React;

/* ============================================================
   Backdrop — fake-blurred Brand Studio behind the modal.
   Artboard is 760x560; backdrop fills it.
   ============================================================ */
function ModalBackdrop({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: '#FBFBFB',
      fontFamily: "'Inter Tight', system-ui, sans-serif"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      filter: 'blur(1.5px) saturate(0.9)',
      opacity: 0.6
    }
  }, /*#__PURE__*/React.createElement(FakeBrandStudio, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(26, 26, 26, 0.32)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24
    }
  }, children));
}

/* A tiny fake of Brand Studio for backdrop context */
function FakeBrandStudio() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: '100%',
      background: '#FBFBFB'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      borderBottom: '1px solid #ECECEC',
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 22,
      height: 22,
      borderRadius: 6,
      background: '#6729F3'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 70,
      height: 10,
      background: '#ECECEC',
      borderRadius: 4
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 80,
      height: 24,
      background: '#F3F4FF',
      borderRadius: 6
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: 'calc(100% - 44px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 140,
      background: '#fff',
      borderRight: '1px solid #ECECEC',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, [0, 1, 2, 3, 4].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      height: 8,
      background: i === 2 ? '#6729F3' : '#ECECEC',
      borderRadius: 4,
      width: i === 2 ? '60%' : '80%'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 24,
      width: 180,
      background: '#ECECEC',
      borderRadius: 6
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 10,
      width: 240,
      background: '#F3F3F3',
      borderRadius: 4,
      marginTop: 8
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginTop: 20
    }
  }, [0, 1, 2, 3].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      height: 72,
      background: '#fff',
      border: '1px solid #D9D9D9',
      borderRadius: 12
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      height: 120,
      background: '#fff',
      border: '1px solid #D9D9D9',
      borderRadius: 12
    }
  }))));
}

/* ============================================================
   Reusable bits
   ============================================================ */

const MODAL_SHELL = {
  background: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0,0,0,0.06)',
  border: '1px solid #ECECEC',
  overflow: 'hidden',
  animation: 'modalIn 200ms cubic-bezier(0.2, 0, 0, 1)'
};

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('modal-anims')) {
  const s = document.createElement('style');
  s.id = 'modal-anims';
  s.textContent = `
    @keyframes modalIn {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
  `;
  document.head.appendChild(s);
}
function BrandBadge({
  size = 40
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.28),
      background: 'linear-gradient(135deg, #F2EFE7 0%, #CB997E 60%, #6B705C 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#1A1A1A',
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: size * 0.45,
      letterSpacing: '-0.02em',
      border: '1px solid rgba(0,0,0,0.08)'
    }
  }, "P");
}
function PrimaryButton({
  children,
  icon,
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      height: 40,
      padding: '0 18px',
      border: 'none',
      borderRadius: 10,
      background: '#6729F3',
      color: '#fff',
      fontFamily: "'Inter Tight'",
      fontWeight: 600,
      fontSize: 14,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      transition: 'background 180ms',
      ...style
    },
    onMouseEnter: e => e.currentTarget.style.background = '#5A21DB',
    onMouseLeave: e => e.currentTarget.style.background = '#6729F3'
  }, icon, children);
}
function SecondaryButton({
  children,
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      height: 40,
      padding: '0 16px',
      border: '1px solid #D9D9D9',
      borderRadius: 10,
      background: '#fff',
      color: '#1A1A1A',
      fontFamily: "'Inter Tight'",
      fontWeight: 600,
      fontSize: 14,
      ...style
    }
  }, children);
}
function GhostButton({
  children,
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      height: 40,
      padding: '0 12px',
      border: 'none',
      borderRadius: 10,
      background: 'transparent',
      color: '#1A1A1A',
      fontFamily: "'Inter Tight'",
      fontWeight: 600,
      fontSize: 14,
      ...style
    }
  }, children);
}
function DangerButton({
  children,
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      height: 40,
      padding: '0 16px',
      border: 'none',
      borderRadius: 10,
      background: '#F34129',
      color: '#fff',
      fontFamily: "'Inter Tight'",
      fontWeight: 600,
      fontSize: 14,
      ...style
    }
  }, children);
}
function CloseX({
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    "aria-label": "Close",
    style: {
      width: 32,
      height: 32,
      borderRadius: 8,
      border: 'none',
      background: 'transparent',
      color: '#8B8C8F',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m6 6 12 12"
  })));
}

/* ============================================================
   VARIATION 1 — Compact confirm
   Single brand, single save action. The default / lightest modal.
   ============================================================ */
function CompactConfirm() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...MODAL_SHELL,
      width: 420
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 24px 8px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 12,
      background: '#F3F4FF',
      color: '#6729F3',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 21v-8H7v8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 3v5h8"
  }))), /*#__PURE__*/React.createElement(CloseX, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 24px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 20,
      letterSpacing: '-0.01em'
    }
  }, "Save changes to Plume?"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: '#8B8C8F',
      marginTop: 6,
      lineHeight: 1.5,
      fontFamily: 'Inter'
    }
  }, "We'll update your brand profile and re-run connected generations with the new identity. This takes about a minute.")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 24px 20px',
      display: 'flex',
      gap: 8,
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(SecondaryButton, null, "Cancel"), /*#__PURE__*/React.createElement(PrimaryButton, null, "Save brand")));
}

/* ============================================================
   VARIATION 2 — Review changes before save
   Shows what changed (diff-style) before committing. The "thoughtful" save.
   ============================================================ */
function ReviewChanges() {
  const changes = [{
    field: 'Tagline',
    from: 'Hydrate the honest way.',
    to: 'Drink like a designer.'
  }, {
    field: 'Category',
    from: 'Beverage',
    to: 'Hydration / lifestyle'
  }, {
    field: 'Palette',
    from: '5 colours',
    to: '5 colours · 2 swapped'
  }, {
    field: 'Voice',
    from: 'Friendly, casual',
    to: 'Direct, practical, a little wry'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...MODAL_SHELL,
      width: 520
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 24px',
      borderBottom: '1px solid #ECECEC',
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(BrandBadge, null), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 16,
      letterSpacing: '-0.01em'
    }
  }, "Review 4 changes to Plume"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: '#8B8C8F',
      marginTop: 2
    }
  }, "Last saved 2 days ago by you")), /*#__PURE__*/React.createElement(CloseX, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px 8px',
      maxHeight: 240,
      overflow: 'auto'
    }
  }, changes.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: c.field,
    style: {
      padding: '10px 12px',
      borderBottom: i < changes.length - 1 ? '1px solid #F3F3F3' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      fontWeight: 600,
      color: '#8B8C8F',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      marginBottom: 4
    }
  }, c.field), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 13,
      fontFamily: 'Inter'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#8B8C8F',
      textDecoration: 'line-through',
      background: '#FBFBFB',
      padding: '3px 8px',
      borderRadius: 6,
      maxWidth: 180,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, c.from), /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#8B8C8F",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m12 5 7 7-7 7"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#1A1A1A',
      fontWeight: 500,
      background: '#F3F4FF',
      padding: '3px 8px',
      borderRadius: 6,
      maxWidth: 220,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, c.to))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 24px',
      background: '#FBFBFB',
      borderTop: '1px solid #ECECEC',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 12.5,
      color: '#33323A'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#6729F3",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 16v-4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 8h.01"
  })), /*#__PURE__*/React.createElement("span", null, "Saving re-runs ", /*#__PURE__*/React.createElement("strong", {
    style: {
      fontWeight: 600
    }
  }, "3 active angles"), " with the new brand profile.")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 24px',
      display: 'flex',
      gap: 8,
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTop: '1px solid #ECECEC'
    }
  }, /*#__PURE__*/React.createElement(GhostButton, null, "View all edits"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(SecondaryButton, null, "Keep editing"), /*#__PURE__*/React.createElement(PrimaryButton, {
    icon: /*#__PURE__*/React.createElement("svg", {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M20 6 9 17l-5-5"
    }))
  }, "Save & sync"))));
}

/* ============================================================
   VARIATION 3 — Save with scope (draft vs. publish)
   Two-option radio card pattern. Useful for first save / destructive publish.
   ============================================================ */
function SaveWithScope() {
  const [scope, setScope] = useState('publish');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...MODAL_SHELL,
      width: 480
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 24px 0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: '#F3F4FF',
      color: '#6729F3',
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2 9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5z"
  })), "Save brand"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 20,
      letterSpacing: '-0.01em'
    }
  }, "How should we save Plume?"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#8B8C8F',
      marginTop: 4,
      fontFamily: 'Inter'
    }
  }, "Choose what happens to the connected tools.")), /*#__PURE__*/React.createElement(CloseX, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 24px 4px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(ScopeOption, {
    active: scope === 'draft',
    onClick: () => setScope('draft'),
    label: "Save as draft",
    desc: "Changes stay private. No generations re-run.",
    hint: "Safe"
  }), /*#__PURE__*/React.createElement(ScopeOption, {
    active: scope === 'publish',
    onClick: () => setScope('publish'),
    label: "Publish updates",
    desc: "Brand profile is updated everywhere and 3 active angles re-generate.",
    hint: "Recommended",
    recommended: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 24px 20px',
      display: 'flex',
      gap: 8,
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(SecondaryButton, null, "Cancel"), /*#__PURE__*/React.createElement(PrimaryButton, null, scope === 'draft' ? 'Save draft' : 'Publish brand')));
}
function ScopeOption({
  active,
  onClick,
  label,
  desc,
  hint,
  recommended
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      border: active ? '1px solid #6729F3' : '1px solid #D9D9D9',
      background: active ? '#F3F4FF' : '#fff',
      borderRadius: 12,
      padding: '12px 14px',
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      cursor: 'pointer',
      transition: 'all 180ms'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 18,
      height: 18,
      borderRadius: 9999,
      marginTop: 2,
      border: active ? '5px solid #6729F3' : '1.5px solid #D9D9D9',
      background: active ? '#fff' : '#fff',
      transition: 'all 180ms',
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 600,
      fontSize: 14,
      color: '#1A1A1A'
    }
  }, label), recommended && /*#__PURE__*/React.createElement("span", {
    style: {
      background: '#DEF2E5',
      color: '#27A644',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.04em',
      padding: '2px 7px',
      borderRadius: 9999,
      textTransform: 'uppercase'
    }
  }, hint), !recommended && hint && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: '#8B8C8F',
      fontWeight: 500
    }
  }, hint)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: '#33323A',
      marginTop: 3,
      fontFamily: 'Inter',
      lineHeight: 1.45
    }
  }, desc)));
}

/* ============================================================
   VARIATION 4 — Unsaved changes warning
   The "you're about to lose work" pattern. Destructive path highlighted.
   ============================================================ */
function UnsavedWarning() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...MODAL_SHELL,
      width: 440
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 24px 8px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 12,
      background: 'rgba(243, 65, 41, 0.08)',
      color: '#F34129',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 9v4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 17h.01"
  }))), /*#__PURE__*/React.createElement(CloseX, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 24px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 20,
      letterSpacing: '-0.01em'
    }
  }, "Leave without saving?"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: '#33323A',
      marginTop: 6,
      lineHeight: 1.5,
      fontFamily: 'Inter'
    }
  }, "You have ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#1A1A1A',
      fontWeight: 600
    }
  }, "4 unsaved changes"), " to Plume \u2014 including tagline, category and palette. These will be discarded if you leave now.")), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '16px 24px 0',
      padding: '10px 12px',
      background: '#FBFBFB',
      border: '1px solid #ECECEC',
      borderRadius: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(BrandBadge, {
    size: 28
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 600,
      fontSize: 13
    }
  }, "Plume"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: '#8B8C8F'
    }
  }, "Identity \xB7 Voice \xB7 Visual edited 2 min ago")), /*#__PURE__*/React.createElement("span", {
    style: {
      background: '#DEF2E5',
      color: '#27A644',
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: '0.04em',
      padding: '3px 8px',
      borderRadius: 9999,
      textTransform: 'uppercase'
    }
  }, "90/100")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 24px 20px',
      display: 'flex',
      gap: 8,
      justifyContent: 'flex-end',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(GhostButton, {
    style: {
      color: '#F34129'
    }
  }, "Discard"), /*#__PURE__*/React.createElement(SecondaryButton, null, "Keep editing"), /*#__PURE__*/React.createElement(PrimaryButton, null, "Save & leave")));
}
Object.assign(window, {
  ModalBackdrop,
  CompactConfirm,
  ReviewChanges,
  SaveWithScope,
  UnsavedWarning
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "Modals.jsx", error: String((e && e.message) || e) }); }

// frames/design-canvas.jsx
try { (() => {
// DesignCanvas.jsx — Figma-ish design canvas wrapper
// Warm gray grid bg + Sections + Artboards + PostIt notes.
// Artboards are reorderable (grip-drag), labels/titles are inline-editable,
// and any artboard can be opened in a fullscreen focus overlay (←/→/Esc).
// State persists to a .design-canvas.state.json sidecar via the host
// bridge. No assets, no deps.
//
// Usage:
//   <DesignCanvas>
//     <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
//       <DCArtboard id="a" label="A · Dusk" width={260} height={480}>…</DCArtboard>
//       <DCArtboard id="b" label="B · Minimal" width={260} height={480}>…</DCArtboard>
//     </DCSection>
//   </DesignCanvas>

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  postitBg: '#fef4a8',
  postitText: '#5a4a2a',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
};

// One-time CSS injection (classes are dc-prefixed so they don't collide with
// the hosted design's own styles).
if (typeof document !== 'undefined' && !document.getElementById('dc-styles')) {
  const s = document.createElement('style');
  s.id = 'dc-styles';
  s.textContent = ['.dc-editable{cursor:text;outline:none;white-space:nowrap;border-radius:3px;padding:0 2px;margin:0 -2px}', '.dc-editable:focus{background:#fff;box-shadow:0 0 0 1.5px #c96442}', '[data-dc-slot]{transition:transform .18s cubic-bezier(.2,.7,.3,1)}', '[data-dc-slot].dc-dragging{transition:none;z-index:10;pointer-events:none}', '[data-dc-slot].dc-dragging .dc-card{box-shadow:0 12px 40px rgba(0,0,0,.25),0 0 0 2px #c96442;transform:scale(1.02)}', '.dc-card{transition:box-shadow .15s,transform .15s}', '.dc-card *{scrollbar-width:none}', '.dc-card *::-webkit-scrollbar{display:none}', '.dc-labelrow{display:flex;align-items:center;gap:4px;height:24px}', '.dc-grip{cursor:grab;display:flex;align-items:center;padding:5px 4px;border-radius:4px;transition:background .12s}', '.dc-grip:hover{background:rgba(0,0,0,.08)}', '.dc-grip:active{cursor:grabbing}', '.dc-labeltext{cursor:pointer;border-radius:4px;padding:3px 6px;display:flex;align-items:center;transition:background .12s}', '.dc-labeltext:hover{background:rgba(0,0,0,.05)}', '.dc-expand{position:absolute;bottom:100%;right:0;margin-bottom:5px;z-index:2;opacity:0;transition:opacity .12s,background .12s;', '  width:22px;height:22px;border-radius:5px;border:none;cursor:pointer;padding:0;', '  background:transparent;color:rgba(60,50,40,.7);display:flex;align-items:center;justify-content:center}', '.dc-expand:hover{background:rgba(0,0,0,.06);color:#2a251f}', '[data-dc-slot]:hover .dc-expand{opacity:1}'].join('\n');
  document.head.appendChild(s);
}
const DCCtx = React.createContext(null);

// ─────────────────────────────────────────────────────────────
// DesignCanvas — stateful wrapper around the pan/zoom viewport.
// Owns runtime state (per-section order, renamed titles/labels, focused
// artboard). Order/titles/labels persist to a .design-canvas.state.json
// sidecar next to the HTML. Reads go via plain fetch() so the saved
// arrangement is visible anywhere the HTML + sidecar are served together
// (omelette preview, direct link, downloaded zip). Writes go through the
// host's window.omelette bridge — editing requires the omelette runtime.
// Focus is ephemeral.
// ─────────────────────────────────────────────────────────────
const DC_STATE_FILE = '.design-canvas.state.json';
function DesignCanvas({
  children,
  minScale,
  maxScale,
  style
}) {
  const [state, setState] = React.useState({
    sections: {},
    focus: null
  });
  // Hold rendering until the sidecar read settles so the saved order/titles
  // appear on first paint (no source-order flash). didRead gates writes until
  // the read settles so the empty initial state can't clobber a slow read;
  // skipNextWrite suppresses the one echo-write that would otherwise follow
  // hydration.
  const [ready, setReady] = React.useState(false);
  const didRead = React.useRef(false);
  const skipNextWrite = React.useRef(false);
  React.useEffect(() => {
    let off = false;
    fetch('./' + DC_STATE_FILE).then(r => r.ok ? r.json() : null).then(saved => {
      if (off || !saved || !saved.sections) return;
      skipNextWrite.current = true;
      setState(s => ({
        ...s,
        sections: saved.sections
      }));
    }).catch(() => {}).finally(() => {
      didRead.current = true;
      if (!off) setReady(true);
    });
    const t = setTimeout(() => {
      if (!off) setReady(true);
    }, 150);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, []);
  React.useEffect(() => {
    if (!didRead.current) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      window.omelette?.writeFile(DC_STATE_FILE, JSON.stringify({
        sections: state.sections
      })).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state.sections]);

  // Build registries synchronously from children so FocusOverlay can read
  // them in the same render. Only direct DCSection > DCArtboard children are
  // walked — wrapping them in other elements opts out of focus/reorder.
  const registry = {}; // slotId -> { sectionId, artboard }
  const sectionMeta = {}; // sectionId -> { title, subtitle, slotIds[] }
  const sectionOrder = [];
  React.Children.forEach(children, sec => {
    if (!sec || sec.type !== DCSection) return;
    const sid = sec.props.id ?? sec.props.title;
    if (!sid) return;
    sectionOrder.push(sid);
    const persisted = state.sections[sid] || {};
    const srcIds = [];
    React.Children.forEach(sec.props.children, ab => {
      if (!ab || ab.type !== DCArtboard) return;
      const aid = ab.props.id ?? ab.props.label;
      if (!aid) return;
      registry[`${sid}/${aid}`] = {
        sectionId: sid,
        artboard: ab
      };
      srcIds.push(aid);
    });
    const kept = (persisted.order || []).filter(k => srcIds.includes(k));
    sectionMeta[sid] = {
      title: persisted.title ?? sec.props.title,
      subtitle: sec.props.subtitle,
      slotIds: [...kept, ...srcIds.filter(k => !kept.includes(k))]
    };
  });
  const api = React.useMemo(() => ({
    state,
    section: id => state.sections[id] || {},
    patchSection: (id, p) => setState(s => ({
      ...s,
      sections: {
        ...s.sections,
        [id]: {
          ...s.sections[id],
          ...(typeof p === 'function' ? p(s.sections[id] || {}) : p)
        }
      }
    })),
    setFocus: slotId => setState(s => ({
      ...s,
      focus: slotId
    }))
  }), [state]);

  // Esc exits focus; any outside pointerdown commits an in-progress rename.
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') api.setFocus(null);
    };
    const onPd = e => {
      const ae = document.activeElement;
      if (ae && ae.isContentEditable && !ae.contains(e.target)) ae.blur();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPd, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPd, true);
    };
  }, [api]);
  return /*#__PURE__*/React.createElement(DCCtx.Provider, {
    value: api
  }, /*#__PURE__*/React.createElement(DCViewport, {
    minScale: minScale,
    maxScale: maxScale,
    style: style
  }, ready && children), state.focus && registry[state.focus] && /*#__PURE__*/React.createElement(DCFocusOverlay, {
    entry: registry[state.focus],
    sectionMeta: sectionMeta,
    sectionOrder: sectionOrder
  }));
}

// ─────────────────────────────────────────────────────────────
// DCViewport — transform-based pan/zoom (internal)
//
// Input mapping (Figma-style):
//   • trackpad pinch  → zoom   (ctrlKey wheel; Safari gesture* events)
//   • trackpad scroll → pan    (two-finger)
//   • mouse wheel     → zoom   (notched; distinguished from trackpad scroll)
//   • middle-drag / primary-drag-on-bg → pan
//
// Transform state lives in a ref and is written straight to the DOM
// (translate3d + will-change) so wheel ticks don't go through React —
// keeps pans at 60fps on dense canvases.
// ─────────────────────────────────────────────────────────────
function DCViewport({
  children,
  minScale = 0.1,
  maxScale = 8,
  style = {}
}) {
  const vpRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const tf = React.useRef({
    x: 0,
    y: 0,
    scale: 1
  });
  const apply = React.useCallback(() => {
    const {
      x,
      y,
      scale
    } = tf.current;
    const el = worldRef.current;
    if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }, []);
  React.useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const zoomAt = (cx, cy, factor) => {
      const r = vp.getBoundingClientRect();
      const px = cx - r.left,
        py = cy - r.top;
      const t = tf.current;
      const next = Math.min(maxScale, Math.max(minScale, t.scale * factor));
      const k = next / t.scale;
      // keep the world point under the cursor fixed
      t.x = px - (px - t.x) * k;
      t.y = py - (py - t.y) * k;
      t.scale = next;
      apply();
    };

    // Mouse-wheel vs trackpad-scroll heuristic. A physical wheel sends
    // line-mode deltas (Firefox) or large integer pixel deltas with no X
    // component (Chrome/Safari, typically multiples of 100/120). Trackpad
    // two-finger scroll sends small/fractional pixel deltas, often with
    // non-zero deltaX. ctrlKey is set by the browser for trackpad pinch.
    const isMouseWheel = e => e.deltaMode !== 0 || e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40;
    const onWheel = e => {
      e.preventDefault();
      if (isGesturing) return; // Safari: gesture* owns the pinch — discard concurrent wheels
      if (e.ctrlKey) {
        // trackpad pinch (or explicit ctrl+wheel)
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else if (isMouseWheel(e)) {
        // notched mouse wheel — fixed-ratio step per click
        zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.18));
      } else {
        // trackpad two-finger scroll — pan
        tf.current.x -= e.deltaX;
        tf.current.y -= e.deltaY;
        apply();
      }
    };

    // Safari sends native gesture* events for trackpad pinch with a smooth
    // e.scale; preferring these over the ctrl+wheel fallback gives a much
    // better feel there. No-ops on other browsers. Safari also fires
    // ctrlKey wheel events during the same pinch — isGesturing makes
    // onWheel drop those entirely so they neither zoom nor pan.
    let gsBase = 1;
    let isGesturing = false;
    const onGestureStart = e => {
      e.preventDefault();
      isGesturing = true;
      gsBase = tf.current.scale;
    };
    const onGestureChange = e => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, gsBase * e.scale / tf.current.scale);
    };
    const onGestureEnd = e => {
      e.preventDefault();
      isGesturing = false;
    };

    // Drag-pan: middle button anywhere, or primary button on canvas
    // background (anything that isn't an artboard or an inline editor).
    let drag = null;
    const onPointerDown = e => {
      const onBg = !e.target.closest('[data-dc-slot], .dc-editable');
      if (!(e.button === 1 || e.button === 0 && onBg)) return;
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        lx: e.clientX,
        ly: e.clientY
      };
      vp.style.cursor = 'grabbing';
    };
    const onPointerMove = e => {
      if (!drag || e.pointerId !== drag.id) return;
      tf.current.x += e.clientX - drag.lx;
      tf.current.y += e.clientY - drag.ly;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      apply();
    };
    const onPointerUp = e => {
      if (!drag || e.pointerId !== drag.id) return;
      vp.releasePointerCapture(e.pointerId);
      drag = null;
      vp.style.cursor = '';
    };
    vp.addEventListener('wheel', onWheel, {
      passive: false
    });
    vp.addEventListener('gesturestart', onGestureStart, {
      passive: false
    });
    vp.addEventListener('gesturechange', onGestureChange, {
      passive: false
    });
    vp.addEventListener('gestureend', onGestureEnd, {
      passive: false
    });
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    return () => {
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerUp);
    };
  }, [apply, minScale, maxScale]);
  const gridSvg = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M120 0H0v120' fill='none' stroke='${encodeURIComponent(DC.grid)}' stroke-width='1'/%3E%3C/svg%3E")`;
  return /*#__PURE__*/React.createElement("div", {
    ref: vpRef,
    className: "design-canvas",
    style: {
      height: '100vh',
      width: '100vw',
      background: DC.bg,
      overflow: 'hidden',
      overscrollBehavior: 'none',
      touchAction: 'none',
      position: 'relative',
      fontFamily: DC.font,
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: worldRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      transformOrigin: '0 0',
      willChange: 'transform',
      width: 'max-content',
      minWidth: '100%',
      minHeight: '100%',
      padding: '60px 0 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -6000,
      backgroundImage: gridSvg,
      backgroundSize: '120px 120px',
      pointerEvents: 'none',
      zIndex: -1
    }
  }), children));
}

// ─────────────────────────────────────────────────────────────
// DCSection — editable title + h-row of artboards in persisted order
// ─────────────────────────────────────────────────────────────
function DCSection({
  id,
  title,
  subtitle,
  children,
  gap = 48
}) {
  const ctx = React.useContext(DCCtx);
  const sid = id ?? title;
  const all = React.Children.toArray(children);
  const artboards = all.filter(c => c && c.type === DCArtboard);
  const rest = all.filter(c => !(c && c.type === DCArtboard));
  const srcOrder = artboards.map(a => a.props.id ?? a.props.label);
  const sec = ctx && sid && ctx.section(sid) || {};
  const order = React.useMemo(() => {
    const kept = (sec.order || []).filter(k => srcOrder.includes(k));
    return [...kept, ...srcOrder.filter(k => !kept.includes(k))];
  }, [sec.order, srcOrder.join('|')]);
  const byId = Object.fromEntries(artboards.map(a => [a.props.id ?? a.props.label, a]));
  return /*#__PURE__*/React.createElement("div", {
    "data-dc-section": sid,
    style: {
      marginBottom: 80,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 60px 56px'
    }
  }, /*#__PURE__*/React.createElement(DCEditable, {
    tag: "div",
    value: sec.title ?? title,
    onChange: v => ctx && sid && ctx.patchSection(sid, {
      title: v
    }),
    style: {
      fontSize: 28,
      fontWeight: 600,
      color: DC.title,
      letterSpacing: -0.4,
      marginBottom: 6,
      display: 'inline-block'
    }
  }), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: DC.subtitle
    }
  }, subtitle)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap,
      padding: '0 60px',
      alignItems: 'flex-start',
      width: 'max-content'
    }
  }, order.map(k => /*#__PURE__*/React.createElement(DCArtboardFrame, {
    key: k,
    sectionId: sid,
    artboard: byId[k],
    order: order,
    label: (sec.labels || {})[k] ?? byId[k].props.label,
    onRename: v => ctx && ctx.patchSection(sid, x => ({
      labels: {
        ...x.labels,
        [k]: v
      }
    })),
    onReorder: next => ctx && ctx.patchSection(sid, {
      order: next
    }),
    onFocus: () => ctx && ctx.setFocus(`${sid}/${k}`)
  }))), rest);
}

// DCArtboard — marker; rendered by DCArtboardFrame via DCSection.
function DCArtboard() {
  return null;
}
function DCArtboardFrame({
  sectionId,
  artboard,
  label,
  order,
  onRename,
  onReorder,
  onFocus
}) {
  const {
    id: rawId,
    label: rawLabel,
    width = 260,
    height = 480,
    children,
    style = {}
  } = artboard.props;
  const id = rawId ?? rawLabel;
  const ref = React.useRef(null);

  // Live drag-reorder: dragged card sticks to cursor; siblings slide into
  // their would-be slots in real time via transforms. DOM order only
  // changes on drop.
  const onGripDown = e => {
    e.preventDefault();
    e.stopPropagation();
    const me = ref.current;
    // translateX is applied in local (pre-scale) space but pointer deltas and
    // getBoundingClientRect().left are screen-space — divide by the viewport's
    // current scale so the dragged card tracks the cursor at any zoom level.
    const scale = me.getBoundingClientRect().width / me.offsetWidth || 1;
    const peers = Array.from(document.querySelectorAll(`[data-dc-section="${sectionId}"] [data-dc-slot]`));
    const homes = peers.map(el => ({
      el,
      id: el.dataset.dcSlot,
      x: el.getBoundingClientRect().left
    }));
    const slotXs = homes.map(h => h.x);
    const startIdx = order.indexOf(id);
    const startX = e.clientX;
    let liveOrder = order.slice();
    me.classList.add('dc-dragging');
    const layout = () => {
      for (const h of homes) {
        if (h.id === id) continue;
        const slot = liveOrder.indexOf(h.id);
        h.el.style.transform = `translateX(${(slotXs[slot] - h.x) / scale}px)`;
      }
    };
    const move = ev => {
      const dx = ev.clientX - startX;
      me.style.transform = `translateX(${dx / scale}px)`;
      const cur = homes[startIdx].x + dx;
      let nearest = 0,
        best = Infinity;
      for (let i = 0; i < slotXs.length; i++) {
        const d = Math.abs(slotXs[i] - cur);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (liveOrder.indexOf(id) !== nearest) {
        liveOrder = order.filter(k => k !== id);
        liveOrder.splice(nearest, 0, id);
        layout();
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const finalSlot = liveOrder.indexOf(id);
      me.classList.remove('dc-dragging');
      me.style.transform = `translateX(${(slotXs[finalSlot] - homes[startIdx].x) / scale}px)`;
      // After the settle transition, kill transitions + clear transforms +
      // commit the reorder in the same frame so there's no visual snap-back.
      setTimeout(() => {
        for (const h of homes) {
          h.el.style.transition = 'none';
          h.el.style.transform = '';
        }
        if (liveOrder.join('|') !== order.join('|')) onReorder(liveOrder);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const h of homes) h.el.style.transition = '';
        }));
      }, 180);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    "data-dc-slot": id,
    style: {
      position: 'relative',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-labelrow",
    style: {
      position: 'absolute',
      bottom: '100%',
      left: -4,
      marginBottom: 4,
      color: DC.label
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-grip",
    onPointerDown: onGripDown,
    title: "Drag to reorder"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "13",
    viewBox: "0 0 9 13",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "11",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "11",
    r: "1.1"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-labeltext",
    onClick: onFocus,
    title: "Click to focus"
  }, /*#__PURE__*/React.createElement(DCEditable, {
    value: label,
    onChange: onRename,
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: DC.label,
      lineHeight: 1
    }
  }))), /*#__PURE__*/React.createElement("button", {
    className: "dc-expand",
    onClick: onFocus,
    onPointerDown: e => e.stopPropagation(),
    title: "Focus"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 1h4v4M5 11H1V7M11 1L7.5 4.5M1 11l3.5-3.5"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-card",
    style: {
      borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06)',
      overflow: 'hidden',
      width,
      height,
      background: '#fff',
      ...style
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb',
      fontSize: 13,
      fontFamily: DC.font
    }
  }, id)));
}

// Inline rename — commits on blur or Enter.
function DCEditable({
  value,
  onChange,
  style,
  tag = 'span',
  onClick
}) {
  const T = tag;
  return /*#__PURE__*/React.createElement(T, {
    className: "dc-editable",
    contentEditable: true,
    suppressContentEditableWarning: true,
    onClick: onClick,
    onPointerDown: e => e.stopPropagation(),
    onBlur: e => onChange && onChange(e.currentTarget.textContent),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    style: style
  }, value);
}

// ─────────────────────────────────────────────────────────────
// Focus mode — overlay one artboard; ←/→ within section, ↑/↓ across
// sections, Esc or backdrop click to exit.
// ─────────────────────────────────────────────────────────────
function DCFocusOverlay({
  entry,
  sectionMeta,
  sectionOrder
}) {
  const ctx = React.useContext(DCCtx);
  const {
    sectionId,
    artboard
  } = entry;
  const sec = ctx.section(sectionId);
  const meta = sectionMeta[sectionId];
  const peers = meta.slotIds;
  const aid = artboard.props.id ?? artboard.props.label;
  const idx = peers.indexOf(aid);
  const secIdx = sectionOrder.indexOf(sectionId);
  const go = d => {
    const n = peers[(idx + d + peers.length) % peers.length];
    if (n) ctx.setFocus(`${sectionId}/${n}`);
  };
  const goSection = d => {
    const ns = sectionOrder[(secIdx + d + sectionOrder.length) % sectionOrder.length];
    const first = sectionMeta[ns] && sectionMeta[ns].slotIds[0];
    if (first) ctx.setFocus(`${ns}/${first}`);
  };
  React.useEffect(() => {
    const k = e => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goSection(-1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goSection(1);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  const {
    width = 260,
    height = 480,
    children
  } = artboard.props;
  const [vp, setVp] = React.useState({
    w: window.innerWidth,
    h: window.innerHeight
  });
  React.useEffect(() => {
    const r = () => setVp({
      w: window.innerWidth,
      h: window.innerHeight
    });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const scale = Math.max(0.1, Math.min((vp.w - 200) / width, (vp.h - 260) / height, 2));
  const [ddOpen, setDd] = React.useState(false);
  const Arrow = ({
    dir,
    onClick
  }) => /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onClick();
    },
    style: {
      position: 'absolute',
      top: '50%',
      [dir]: 28,
      transform: 'translateY(-50%)',
      border: 'none',
      background: 'rgba(255,255,255,.08)',
      color: 'rgba(255,255,255,.9)',
      width: 44,
      height: 44,
      borderRadius: 22,
      fontSize: 18,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .15s'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.18)',
    onMouseLeave: e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: dir === 'left' ? 'M11 3L5 9l6 6' : 'M7 3l6 6-6 6'
  })));

  // Portal to body so position:fixed is the real viewport regardless of any
  // transform on DesignCanvas's ancestors (including the canvas zoom itself).
  return ReactDOM.createPortal(/*#__PURE__*/React.createElement("div", {
    onClick: () => ctx.setFocus(null),
    onWheel: e => e.preventDefault(),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(24,20,16,.6)',
      backdropFilter: 'blur(14px)',
      fontFamily: DC.font,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 72,
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px 20px 0',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDd(o => !o),
    style: {
      border: 'none',
      background: 'transparent',
      color: '#fff',
      cursor: 'pointer',
      padding: '6px 8px',
      borderRadius: 6,
      textAlign: 'left',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: -0.3
    }
  }, meta.title), /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 11 11",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    style: {
      opacity: .7
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 4l3.5 3.5L9 4"
  }))), meta.subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      opacity: .6,
      fontWeight: 400,
      marginTop: 2
    }
  }, meta.subtitle)), ddOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      background: '#2a251f',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      padding: 4,
      minWidth: 200,
      zIndex: 10
    }
  }, sectionOrder.map(sid => /*#__PURE__*/React.createElement("button", {
    key: sid,
    onClick: () => {
      setDd(false);
      const f = sectionMeta[sid].slotIds[0];
      if (f) ctx.setFocus(`${sid}/${f}`);
    },
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      border: 'none',
      cursor: 'pointer',
      background: sid === sectionId ? 'rgba(255,255,255,.1)' : 'transparent',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: 5,
      fontSize: 14,
      fontWeight: sid === sectionId ? 600 : 400,
      fontFamily: 'inherit'
    }
  }, sectionMeta[sid].title)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => ctx.setFocus(null),
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.12)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
    style: {
      border: 'none',
      background: 'transparent',
      color: 'rgba(255,255,255,.7)',
      width: 32,
      height: 32,
      borderRadius: 16,
      fontSize: 20,
      cursor: 'pointer',
      lineHeight: 1,
      transition: 'background .12s'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 64,
      bottom: 56,
      left: 100,
      right: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: width * scale,
      height: height * scale,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      background: '#fff',
      borderRadius: 2,
      overflow: 'hidden',
      boxShadow: '0 20px 80px rgba(0,0,0,.4)'
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb'
    }
  }, aid))), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 14,
      fontWeight: 500,
      opacity: .85,
      textAlign: 'center'
    }
  }, (sec.labels || {})[aid] ?? artboard.props.label, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .5,
      marginLeft: 10,
      fontVariantNumeric: 'tabular-nums'
    }
  }, idx + 1, " / ", peers.length))), /*#__PURE__*/React.createElement(Arrow, {
    dir: "left",
    onClick: () => go(-1)
  }), /*#__PURE__*/React.createElement(Arrow, {
    dir: "right",
    onClick: () => go(1)
  }), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 8
    }
  }, peers.map((p, i) => /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => ctx.setFocus(`${sectionId}/${p}`),
    style: {
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      width: 6,
      height: 6,
      borderRadius: 3,
      background: i === idx ? '#fff' : 'rgba(255,255,255,.3)'
    }
  })))), document.body);
}

// ─────────────────────────────────────────────────────────────
// Post-it — absolute-positioned sticky note
// ─────────────────────────────────────────────────────────────
function DCPostIt({
  children,
  top,
  left,
  right,
  bottom,
  rotate = -2,
  width = 180
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      right,
      bottom,
      width,
      background: DC.postitBg,
      padding: '14px 16px',
      fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
      fontSize: 14,
      lineHeight: 1.4,
      color: DC.postitText,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
      transform: `rotate(${rotate}deg)`,
      zIndex: 5
    }
  }, children);
}
Object.assign(window, {
  DesignCanvas,
  DCSection,
  DCArtboard,
  DCPostIt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "frames/design-canvas.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ai-angles/AdIntelScreen.jsx
try { (() => {
/* global React, Icon, Button, Chip, Score, Card */
function AdIntelScreen() {
  const ads = [{
    brand: 'Aetna Beverages',
    spend: '$18.4K',
    growth: '+42%',
    format: 'Video',
    hook: 'The bottle that doesn\'t sweat on your desk.',
    status: 'Live'
  }, {
    brand: 'Current Hydration',
    spend: '$9.1K',
    growth: '+12%',
    format: 'Carousel',
    hook: '4 reasons your old flask is working against you.',
    status: 'Live'
  }, {
    brand: 'Owala',
    spend: '$44.8K',
    growth: '+78%',
    format: 'Video',
    hook: 'One hand. One sip. One flavour at a time.',
    status: 'Paused'
  }, {
    brand: 'Larq',
    spend: '$22.0K',
    growth: '-4%',
    format: 'Static',
    hook: 'Self-cleaning means never smelling your morning run.',
    status: 'Live'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '28px 28px 60px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 28,
      letterSpacing: '-0.02em'
    }
  }, "Ad Intelligence"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#8B8C8F',
      fontSize: 13.5,
      marginTop: 4
    }
  }, "Competitor ads in the hydration category \xB7 last 30 days")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "filter"
  }, "Filter"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "calendar"
  }, "30 days"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    icon: "export"
  }, "Export report"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12,
      marginTop: 20
    }
  }, [{
    label: 'Ads tracked',
    val: '1,284',
    delta: '+12%',
    color: 'green'
  }, {
    label: 'Est. spend',
    val: '$284K',
    delta: '+24%',
    color: 'green'
  }, {
    label: 'New angles',
    val: '47',
    delta: '+6%',
    color: 'green'
  }, {
    label: 'Brands monitored',
    val: '12',
    delta: '0',
    color: 'grey'
  }].map(s => /*#__PURE__*/React.createElement(Card, {
    key: s.label,
    padding: 16
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#8B8C8F'
    }
  }, s.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 26,
      letterSpacing: '-0.02em',
      marginTop: 6
    }
  }, s.val), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    color: s.color
  }, s.delta))))), /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    style: {
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 15
    }
  }, "Ad volume over time"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, ['7d', '30d', '90d'].map((p, i) => /*#__PURE__*/React.createElement("span", {
    key: p,
    style: {
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 600,
      background: i === 1 ? '#F3F4FF' : 'transparent',
      color: i === 1 ? '#6729F3' : '#8B8C8F',
      cursor: 'pointer'
    }
  }, p)))), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 600 140",
    style: {
      width: '100%',
      height: 140,
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "chartG",
    x1: "0",
    x2: "0",
    y1: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#6729F3",
    stopOpacity: "0.22"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#6729F3",
    stopOpacity: "0"
  }))), /*#__PURE__*/React.createElement("path", {
    d: "M0,100 C60,90 90,70 140,65 C200,60 240,85 300,70 C360,55 420,30 480,40 C540,50 580,30 600,20 L600,140 L0,140 Z",
    fill: "url(#chartG)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M0,100 C60,90 90,70 140,65 C200,60 240,85 300,70 C360,55 420,30 480,40 C540,50 580,30 600,20",
    stroke: "#6729F3",
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 15,
      marginBottom: 10
    }
  }, "Top competitor ads"), /*#__PURE__*/React.createElement(Card, {
    padding: 0
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.2fr 2fr 0.8fr 0.8fr 0.8fr 0.6fr 40px',
      padding: '10px 18px',
      borderBottom: '1px solid #ECECEC',
      fontSize: 11,
      color: '#8B8C8F',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", null, "Brand"), /*#__PURE__*/React.createElement("span", null, "Hook"), /*#__PURE__*/React.createElement("span", null, "Format"), /*#__PURE__*/React.createElement("span", null, "Spend"), /*#__PURE__*/React.createElement("span", null, "Growth"), /*#__PURE__*/React.createElement("span", null, "Status"), /*#__PURE__*/React.createElement("span", null)), ads.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'grid',
      gridTemplateColumns: '1.2fr 2fr 0.8fr 0.8fr 0.8fr 0.6fr 40px',
      padding: '14px 18px',
      borderBottom: i < ads.length - 1 ? '1px solid #ECECEC' : 'none',
      alignItems: 'center',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 7,
      background: '#F3F3F3',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#33323A',
      fontWeight: 700,
      fontSize: 11
    }
  }, a.brand[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600
    }
  }, a.brand)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#33323A'
    }
  }, "\"", a.hook, "\""), /*#__PURE__*/React.createElement("span", null, a.format), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      fontFamily: "'Inter Tight'"
    }
  }, a.spend), /*#__PURE__*/React.createElement("span", {
    style: {
      color: a.growth.startsWith('-') ? '#F34129' : a.growth === '0' ? '#8B8C8F' : '#27A644',
      fontWeight: 600
    }
  }, a.growth), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Chip, {
    color: a.status === 'Live' ? 'green' : 'grey'
  }, a.status)), /*#__PURE__*/React.createElement(Icon, {
    name: "more",
    size: 16
  }))))));
}
Object.assign(window, {
  AdIntelScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ai-angles/AdIntelScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ai-angles/AngleLabsScreen.jsx
try { (() => {
/* global React, Icon, Button, Chip, Score, Card */
const {
  useState: useStateAL
} = React;
function AngleLabsScreen() {
  const [stage, setStage] = useStateAL('input'); // input | loading | results
  const [goal, setGoal] = useStateAL('Reposition our minimalist water bottle for busy urban professionals who forget to hydrate.');
  const angles = [{
    score: 92,
    title: 'Hydrate on the go — for the 2pm slump',
    hook: 'You skipped lunch. Again. This bottle remembers so you don\'t have to.',
    audience: 'Urban 25-40, knowledge workers',
    channel: 'TikTok · IG Reels'
  }, {
    score: 88,
    title: 'The bottle that fits your bag, not your ego',
    hook: 'No steel tumbler gymnastics. Just 500ml, minimal, under 200g.',
    audience: 'Commuter women, design-led',
    channel: 'IG · Pinterest'
  }, {
    score: 85,
    title: 'Stop drinking from stadium cups at your desk',
    hook: 'Your deskmate\'s 64oz lifestyle isn\'t yours. Here\'s hydration that is.',
    audience: 'Office workers, 30+',
    channel: 'LinkedIn · Meta'
  }, {
    score: 78,
    title: 'Minimalism isn\'t a vibe — it\'s a 10am meeting saved',
    hook: 'Fewer things, faster mornings. Starts with what\'s in your hand.',
    audience: 'Design-conscious, 28-45',
    channel: 'IG · YouTube'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '28px 28px 60px',
      maxWidth: 1200
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Chip, null, "Create your idea"), /*#__PURE__*/React.createElement(Chip, {
    color: "grey"
  }, "Plume \xB7 Hydra bottle")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 28,
      letterSpacing: '-0.02em'
    }
  }, "Angle Labs"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#8B8C8F',
      fontSize: 13.5,
      marginTop: 4
    }
  }, "Describe your goal, upload a product image, and we'll generate 8 on-brand angles."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 320px',
      gap: 20,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Card, {
    padding: 20
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 84,
      height: 84,
      borderRadius: 10,
      background: '#F3F3F3',
      backgroundImage: 'linear-gradient(135deg,#6729F3 0%,#9E87FE 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 13
    }
  }, "Product"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 500,
      fontSize: 12,
      color: '#33323A',
      marginBottom: 4
    }
  }, "Your goal"), /*#__PURE__*/React.createElement("textarea", {
    value: goal,
    onChange: e => setGoal(e.target.value),
    rows: 3,
    style: {
      width: '100%',
      border: '1px solid #D9D9D9',
      borderRadius: 8,
      padding: 10,
      fontFamily: 'Inter',
      fontSize: 13.5,
      color: '#1A1A1A',
      resize: 'none',
      outline: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 14,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "upload"
  }, "Upload assets"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "link"
  }, "Paste URL"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "pill",
    onClick: () => {
      setStage('loading');
      setTimeout(() => setStage('results'), 900);
    }
  }, "Generate angle"))), stage === 'loading' && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20
    }
  }, [1, 2, 3].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      height: 84,
      borderRadius: 12,
      marginBottom: 12,
      background: 'linear-gradient(90deg, #F3F3F3 0%, #FBFBFB 50%, #F3F3F3 100%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s linear infinite'
    }
  }))), stage === 'results' && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 15
    }
  }, "4 angles generated"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "filter"
  }, "Filter"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "export"
  }, "Export"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, angles.map((a, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    hoverable: true,
    padding: 16
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 12,
      color: '#8B8C8F',
      letterSpacing: '0.04em'
    }
  }, "ANGLE ", i + 1), /*#__PURE__*/React.createElement(Score, {
    n: a.score
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 16,
      marginTop: 6,
      letterSpacing: '-0.01em'
    }
  }, a.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Inter',
      fontSize: 13,
      color: '#33323A',
      marginTop: 4,
      fontStyle: 'italic'
    }
  }, "\"", a.hook, "\""), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#8B8C8F',
      marginTop: 8,
      display: 'flex',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Icon, {
    name: "profile-2user",
    size: 12
  }), " ", a.audience), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Icon, {
    name: "send",
    size: 12
  }), " ", a.channel))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: iconBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "heart",
    size: 14
  })), /*#__PURE__*/React.createElement("button", {
    style: iconBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "copy",
    size: 14
  })), /*#__PURE__*/React.createElement("button", {
    style: iconBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more",
    size: 14
  }))))))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Card, {
    padding: 16,
    style: {
      background: 'linear-gradient(180deg,#F3F4FF 0%,#fff 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info-circle",
    size: 16
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 13
    }
  }, "Better briefs, better angles")), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: '10px 0 0',
      paddingLeft: 18,
      color: '#33323A',
      fontSize: 12.5,
      lineHeight: 1.5,
      fontFamily: 'Inter'
    }
  }, /*#__PURE__*/React.createElement("li", null, "Name the moment: when does the customer need this?"), /*#__PURE__*/React.createElement("li", null, "Drop the adjectives \u2014 describe the outcome."), /*#__PURE__*/React.createElement("li", null, "Mention a rival category, not a rival brand."))), /*#__PURE__*/React.createElement(Card, {
    padding: 16,
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 13
    }
  }, "This run"), /*#__PURE__*/React.createElement(Row, {
    label: "Brand",
    value: "Plume"
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Product",
    value: "Hydra bottle 500ml"
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Audience",
    value: "Urban 25-40"
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Tone",
    value: "Clever, not clever"
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Credits used",
    value: "8"
  })))), /*#__PURE__*/React.createElement("style", null, `@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`));
}
const iconBtn = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: '1px solid #ECECEC',
  background: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer'
};
function Row({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '6px 0',
      borderBottom: '1px solid #ECECEC',
      fontSize: 12.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#8B8C8F'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: '#1A1A1A'
    }
  }, value));
}
Object.assign(window, {
  AngleLabsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ai-angles/AngleLabsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ai-angles/App.jsx
try { (() => {
/* global React, ReactDOM, Sidebar, TopBar, HomeScreen, AngleLabsScreen, AdIntelScreen, BrandScreen */
const {
  useState
} = React;
function App() {
  const initial = typeof localStorage !== 'undefined' && localStorage.getItem('phot-page') || 'home';
  const [page, setPageRaw] = useState(initial);
  const setPage = p => {
    setPageRaw(p);
    try {
      localStorage.setItem('phot-page', p);
    } catch (e) {}
  };
  const titles = {
    'home': {
      t: 'Home',
      s: 'Welcome back, Ari'
    },
    'angle-labs': {
      t: 'Angle Labs',
      s: 'Generate marketing angles from product briefs'
    },
    'ad-intel': {
      t: 'Ad Intelligence',
      s: 'Monitor competitor ads and creative trends'
    },
    'brand': {
      t: 'Brand Studio',
      s: 'Your identity, voice, and audience in one place'
    }
  };
  const {
    t,
    s
  } = titles[page] || titles['home'];
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": `01 ${t}`,
    style: {
      display: 'flex',
      minHeight: '100vh',
      background: '#FBFBFB'
    }
  }, /*#__PURE__*/React.createElement(Sidebar, {
    page: page,
    setPage: setPage
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    title: t,
    subtitle: s
  }), page === 'home' && /*#__PURE__*/React.createElement(HomeScreen, {
    setPage: setPage
  }), page === 'angle-labs' && /*#__PURE__*/React.createElement(AngleLabsScreen, null), page === 'ad-intel' && /*#__PURE__*/React.createElement(AdIntelScreen, null), page === 'brand' && /*#__PURE__*/React.createElement(BrandScreen, null)));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ai-angles/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ai-angles/BrandScreen.jsx
try { (() => {
/* global React, Icon, Button, Chip, Card */
function BrandScreen() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '28px 28px 60px',
      maxWidth: 1100
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 28,
      letterSpacing: '-0.02em'
    }
  }, "Brand Studio"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#8B8C8F',
      fontSize: 13.5,
      marginTop: 4
    }
  }, "Identity \xB7 Voice \xB7 Visual \xB7 Audience \xB7 Catalog")), /*#__PURE__*/React.createElement(Button, {
    variant: "pill",
    icon: "sparkles"
  }, "Optimise brand")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      marginTop: 18,
      borderBottom: '1px solid #ECECEC'
    }
  }, ['Identity', 'Voice', 'Visual', 'Audience', 'Catalog'].map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      padding: '10px 14px',
      fontFamily: "'Inter Tight'",
      fontWeight: 600,
      fontSize: 13,
      color: i === 0 ? '#1A1A1A' : '#8B8C8F',
      borderBottom: i === 0 ? '2px solid #6729F3' : '2px solid transparent',
      marginBottom: -1,
      cursor: 'pointer'
    }
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 320px',
      gap: 20,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Card, {
    padding: 20
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 15
    }
  }, "Identity"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Brand name",
    value: "Plume"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Category",
    value: "Hydration / lifestyle"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Tagline",
    value: "Drink like a designer."
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Founded",
    value: "2021 \xB7 Brooklyn, NY"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: '#8B8C8F',
      marginBottom: 4,
      fontWeight: 500,
      letterSpacing: '-0.15px'
    }
  }, "Brand story"), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid #D9D9D9',
      borderRadius: 8,
      padding: 12,
      fontSize: 13.5,
      fontFamily: 'Inter',
      color: '#1A1A1A',
      lineHeight: 1.5
    }
  }, "Plume makes small, quiet, honest objects for people who design their days. Our hero is the 500ml bottle that fits every bag. We're anti-stadium-cup, anti-plastic, anti-accessory-of-the-week."))), /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 15
    }
  }, "Colour palette"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 14
    }
  }, ['#F2EFE7', '#1A1A1A', '#6B705C', '#CB997E', '#B7B7A4'].map(c => /*#__PURE__*/React.createElement("div", {
    key: c,
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 72,
      borderRadius: 10,
      background: c,
      border: '1px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontFamily: 'ui-monospace, monospace',
      color: '#8B8C8F',
      marginTop: 6
    }
  }, c)))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Card, {
    padding: 16
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 13
    }
  }, "Brand health"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 44,
      letterSpacing: '-0.02em',
      color: '#27A644'
    }
  }, "90"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#8B8C8F',
      fontSize: 12
    }
  }, "/ 100")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      background: '#ECECEC',
      borderRadius: 9999,
      marginTop: 6,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '90%',
      height: '100%',
      background: '#27A644'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#8B8C8F',
      marginTop: 10,
      lineHeight: 1.5
    }
  }, "Strong voice + visual. Audience profile could be sharper.")), /*#__PURE__*/React.createElement(Card, {
    padding: 16,
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 13
    }
  }, "Connected"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 10
    }
  }, [{
    n: 'Shopify',
    ok: true
  }, {
    n: 'Meta Ads',
    ok: true
  }, {
    n: 'TikTok Ads',
    ok: false
  }, {
    n: 'Google Drive',
    ok: true
  }].map(s => /*#__PURE__*/React.createElement("div", {
    key: s.n,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", null, s.n), s.ok ? /*#__PURE__*/React.createElement(Chip, {
    color: "green"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "tick-circle",
    size: 11,
    style: {
      filter: 'invert(48%) sepia(74%) saturate(426%) hue-rotate(90deg)'
    }
  }), " Connected") : /*#__PURE__*/React.createElement(Chip, {
    color: "grey"
  }, "Not connected"))))))));
}
function Field({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: '#8B8C8F',
      marginBottom: 4,
      fontWeight: 500,
      letterSpacing: '-0.15px'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid #D9D9D9',
      borderRadius: 8,
      padding: '10px 12px',
      fontSize: 13.5,
      fontFamily: "'Inter Tight'",
      color: '#1A1A1A'
    }
  }, value));
}
Object.assign(window, {
  BrandScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ai-angles/BrandScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ai-angles/HomeScreen.jsx
try { (() => {
/* global React, Icon, Button, Chip, Score, Card, Mark */

function HomeScreen({
  setPage
}) {
  const tools = [{
    id: 'angle-labs',
    chip: 'CREATE YOUR IDEA',
    title: 'Angle Labs',
    desc: 'Upload your product image or describe your campaign goal — get 8 on-brand angles in seconds.',
    icon: 'sparkles',
    preview: 'linear-gradient(135deg,#6729F3 0%, #9E87FE 60%, #E5CAFF 100%)'
  }, {
    id: 'ad-intel',
    chip: 'ANALYSE',
    title: 'Ad Intelligence',
    desc: 'Monitor competitor ads across Meta, TikTok and YouTube. Weekly reports with angle breakdowns.',
    icon: 'trend-up',
    preview: 'linear-gradient(135deg,#17181C 0%, #33323A 60%, #6729F3 100%)'
  }, {
    id: 'brand',
    chip: 'SET UP',
    title: 'Brand Studio',
    desc: 'Your identity, visuals, messaging, and audience in one profile — so every output stays on brand.',
    icon: 'color-swatch',
    preview: 'linear-gradient(135deg,#FC4FF6 0%, #9E87FE 50%, #6729F3 100%)'
  }];
  const quick = [{
    icon: 'magicpen',
    label: 'Optimise listing'
  }, {
    icon: 'text-block',
    label: 'Write ad copy'
  }, {
    icon: 'gallery-add',
    label: 'Generate visual'
  }, {
    icon: 'video-play',
    label: 'Script a reel'
  }];
  const recent = [{
    t: 'Hydrate on the go — minimalist bottle for busy mornings',
    brand: 'Plume',
    score: 92,
    when: '2 min ago'
  }, {
    t: 'Crispy, crunchy, uniformly seasoned — Lay\'s vs ordinary',
    brand: 'Lay\'s',
    score: 87,
    when: '1 hr ago'
  }, {
    t: 'The last moisturiser you\'ll buy this winter',
    brand: 'Lumen',
    score: 78,
    when: 'Yesterday'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '28px 28px 60px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 16,
      padding: '36px 32px',
      background: 'linear-gradient(180deg, rgba(243,244,255,0) 0%, rgba(115,41,243,0.08) 100%), #fff',
      border: '1px solid #ECECEC',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(Chip, null, "Create your idea"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 42,
      letterSpacing: '-0.02em',
      lineHeight: 1.05,
      marginTop: 14
    }
  }, "what you Creating today?"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#33323A',
      fontSize: 15,
      fontFamily: 'Inter',
      marginTop: 8,
      maxWidth: 560,
      lineHeight: 1.5
    }
  }, "Generate angles, monitor competitors, write copy, and ship creatives \u2014 all from your product URL."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "pill",
    onClick: () => setPage('angle-labs')
  }, "Give it a try"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary"
  }, "See a demo"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 16,
      marginTop: 28
    }
  }, tools.map(t => /*#__PURE__*/React.createElement(Card, {
    key: t.id,
    hoverable: true,
    padding: 14,
    radius: 16,
    onClick: () => setPage(t.id),
    style: {
      boxShadow: '0 3.7px 120px rgba(103,41,243,0.04)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 120,
      borderRadius: 10,
      background: t.preview,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'flex-end',
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: 'rgba(255,255,255,0.2)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: t.icon,
    size: 18,
    style: {
      filter: 'invert(1)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(Chip, null, t.chip), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 18,
      marginTop: 8,
      letterSpacing: '-0.01em'
    }
  }, t.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: '#8B8C8F',
      marginTop: 4,
      fontFamily: 'Inter',
      lineHeight: 1.45
    }
  }, t.desc))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 32
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 600,
      fontSize: 13,
      color: '#8B8C8F',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      marginBottom: 10
    }
  }, "Quick actions"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12
    }
  }, quick.map(q => /*#__PURE__*/React.createElement(Card, {
    key: q.label,
    hoverable: true,
    padding: 14
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 8,
      background: '#F3F4FF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#6729F3'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: q.icon,
    size: 16,
    style: {
      filter: 'invert(19%) sepia(98%) saturate(5640%) hue-rotate(258deg) brightness(97%)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 600,
      fontSize: 13.5
    }
  }, q.label)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 32
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 18,
      letterSpacing: '-0.01em'
    }
  }, "Your recent generations"), /*#__PURE__*/React.createElement("a", {
    style: {
      color: '#6729F3',
      fontSize: 13,
      fontWeight: 600,
      textDecoration: 'none',
      cursor: 'pointer'
    }
  }, "See all \u2192")), /*#__PURE__*/React.createElement(Card, {
    padding: 0
  }, recent.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '14px 20px',
      borderBottom: i < recent.length - 1 ? '1px solid #ECECEC' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 8,
      background: '#F3F4FF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 16,
    style: {
      filter: 'invert(19%) sepia(98%) saturate(5640%) hue-rotate(258deg) brightness(97%)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 600,
      fontSize: 14
    }
  }, r.t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#8B8C8F',
      marginTop: 2
    }
  }, "Brand \xB7 ", r.brand, " \xB7 ", r.when)), /*#__PURE__*/React.createElement(Score, {
    n: r.score
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "more",
    size: 16
  }))))));
}
Object.assign(window, {
  HomeScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ai-angles/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ai-angles/Sidebar.jsx
try { (() => {
/* global React, Icon, Mark */
const {
  useState
} = React;
function Sidebar({
  page,
  setPage
}) {
  const items = [{
    id: 'home',
    label: 'Home',
    icon: 'home'
  }, {
    id: 'angle-labs',
    label: 'Angle Labs',
    icon: 'sparkles'
  }, {
    id: 'ad-intel',
    label: 'Ad Intelligence',
    icon: 'trend-up'
  }, {
    id: 'brand',
    label: 'Brand',
    icon: 'color-swatch'
  }];
  const more = [{
    label: 'Products',
    icon: 'shop'
  }, {
    label: 'Trends',
    icon: 'trend-up'
  }, {
    label: 'Uploads',
    icon: 'folder-cloud'
  }, {
    label: 'Generations',
    icon: 'task-square'
  }];
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 240,
      background: '#fff',
      borderRight: '1px solid #ECECEC',
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      height: '100vh',
      position: 'sticky',
      top: 0,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '6px 8px',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Mark, {
    size: 26
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 16,
      letterSpacing: '-0.01em'
    }
  }, "Phot", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#6729F3'
    }
  }, ".AI"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: '#8B8C8F',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '8px 10px 4px',
      fontWeight: 600
    }
  }, "Workspace"), items.map(it => /*#__PURE__*/React.createElement(NavItem, {
    key: it.id,
    active: page === it.id,
    onClick: () => setPage(it.id),
    icon: it.icon
  }, it.label)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: '#8B8C8F',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '16px 10px 4px',
      fontWeight: 600
    }
  }, "Library"), more.map(it => /*#__PURE__*/React.createElement(NavItem, {
    key: it.label,
    icon: it.icon
  }, it.label)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid #ECECEC',
      borderRadius: 12,
      padding: 12,
      background: 'linear-gradient(180deg, #F3F4FF 0%, #fff 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11,
      color: '#6729F3',
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "coin",
    size: 14,
    style: {
      filter: 'invert(19%) sepia(98%) saturate(5640%) hue-rotate(258deg) brightness(97%)'
    }
  }), "Credits"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 22,
      marginTop: 4,
      letterSpacing: '-0.01em'
    }
  }, "1,240"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#8B8C8F',
      marginTop: 2
    }
  }, "of 5,000 monthly"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 4,
      background: '#ECECEC',
      borderRadius: 9999,
      marginTop: 8,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '25%',
      height: '100%',
      background: '#6729F3'
    }
  }))));
}
function NavItem({
  active,
  icon,
  children,
  onClick
}) {
  const [hover, setHover] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 10px',
      borderRadius: 8,
      background: active ? '#F3F4FF' : hover ? '#FBFBFB' : 'transparent',
      color: active ? '#6729F3' : '#33323A',
      fontFamily: "'Inter Tight'",
      fontSize: 13,
      fontWeight: active ? 600 : 500,
      cursor: 'pointer',
      transition: 'background 120ms'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16,
    style: active ? {
      filter: 'invert(19%) sepia(98%) saturate(5640%) hue-rotate(258deg) brightness(97%)'
    } : {}
  }), children);
}
Object.assign(window, {
  Sidebar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ai-angles/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ai-angles/TopBar.jsx
try { (() => {
/* global React, Icon, Avatar, Chip */
const {
  useState: useStateTB
} = React;
function TopBar({
  title,
  subtitle,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '14px 28px',
      borderBottom: '1px solid #ECECEC',
      background: '#fff',
      position: 'sticky',
      top: 0,
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Inter Tight'",
      fontWeight: 700,
      fontSize: 20,
      letterSpacing: '-0.01em',
      lineHeight: 1.1
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#8B8C8F',
      marginTop: 2
    }
  }, subtitle)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 280,
      height: 36,
      border: '1px solid #D9D9D9',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: 8,
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search-normal",
    size: 14
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search angles, products, reports\u2026",
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      fontFamily: 'Inter',
      fontSize: 13,
      color: '#1A1A1A',
      background: 'transparent'
    }
  })), /*#__PURE__*/React.createElement(Chip, {
    color: "purple",
    style: {
      height: 32,
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "coin",
    size: 13,
    style: {
      filter: 'invert(19%) sepia(98%) saturate(5640%) hue-rotate(258deg) brightness(97%)'
    }
  }), "1,240"), /*#__PURE__*/React.createElement("button", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 8,
      border: '1px solid #ECECEC',
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "notification",
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 7,
      right: 8,
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: '#F34129',
      border: '1.5px solid #fff'
    }
  })), /*#__PURE__*/React.createElement(Avatar, {
    initials: "AR",
    size: 32
  }), actions);
}
Object.assign(window, {
  TopBar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ai-angles/TopBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ai-angles/components.jsx
try { (() => {
/* global React */
const {
  useState
} = React;

// ---------- Icon ----------
// Renders an icon from ../../assets/icons/<name>.svg; stroke inherits currentColor
function Icon({
  name,
  size = 18,
  style
}) {
  return /*#__PURE__*/React.createElement("img", {
    src: `../../assets/icons/${name}.svg`,
    width: size,
    height: size,
    style: {
      display: 'inline-block',
      verticalAlign: 'middle',
      ...style
    },
    alt: ""
  });
}

// ---------- Button ----------
function Button({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  icon,
  style
}) {
  const sizes = {
    sm: {
      h: 28,
      px: 12,
      fs: 12,
      r: 6
    },
    md: {
      h: 36,
      px: 16,
      fs: 14,
      r: 8
    },
    lg: {
      h: 44,
      px: 20,
      fs: 15,
      r: 10
    }
  };
  const s = sizes[size];
  const base = {
    height: s.h,
    padding: `0 ${s.px}px`,
    borderRadius: s.r,
    fontFamily: "'Inter Tight', system-ui, sans-serif",
    fontWeight: 600,
    fontSize: s.fs,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    transition: 'all 150ms cubic-bezier(0.2,0,0,1)',
    border: 'none',
    outline: 'none',
    letterSpacing: '-0.01em'
  };
  const variants = {
    primary: {
      background: '#6729F3',
      color: '#fff'
    },
    pill: {
      background: '#6729F3',
      color: '#fff',
      borderRadius: 9999,
      fontWeight: 700,
      letterSpacing: '0.02em',
      textTransform: 'uppercase',
      fontSize: 12
    },
    secondary: {
      background: '#fff',
      color: '#1A1A1A',
      border: '1px solid #D9D9D9'
    },
    ghost: {
      background: 'transparent',
      color: '#6729F3'
    },
    dark: {
      background: '#1A1A1A',
      color: '#fff'
    },
    danger: {
      background: '#fff',
      color: '#F34129',
      border: '1px solid #F34129'
    }
  };
  return /*#__PURE__*/React.createElement("button", {
    style: {
      ...base,
      ...variants[variant],
      ...style
    },
    onClick: onClick
  }, icon && /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  }), children);
}

// ---------- Chip ----------
function Chip({
  children,
  color = 'purple',
  style
}) {
  const palettes = {
    purple: {
      bg: '#F3F4FF',
      fg: '#6729F3'
    },
    green: {
      bg: '#DEF2E5',
      fg: '#27A644'
    },
    amber: {
      bg: '#FEF1DB',
      fg: '#B27207'
    },
    red: {
      bg: '#FEE4E0',
      fg: '#F34129'
    },
    grey: {
      bg: '#ECECEC',
      fg: '#33323A'
    },
    dark: {
      bg: '#1A1A1A',
      fg: '#fff'
    }
  };
  const p = palettes[color];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 24,
      padding: '0 10px',
      borderRadius: 9999,
      background: p.bg,
      color: p.fg,
      fontFamily: "'Inter Tight', sans-serif",
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      ...style
    }
  }, children);
}

// ---------- Score pill ----------
function Score({
  n
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: 22,
      padding: '0 9px',
      borderRadius: 9999,
      background: '#DEF2E5',
      color: '#27A644',
      fontFamily: "'Inter Tight', sans-serif",
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: '0.01em'
    }
  }, n, "/100");
}

// ---------- Card ----------
function Card({
  children,
  hoverable = false,
  padding = 20,
  radius = 12,
  style,
  onClick
}) {
  const [hover, setHover] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: '#fff',
      border: '1px solid ' + (hoverable && hover ? '#6729F3' : '#D9D9D9'),
      borderRadius: radius,
      padding,
      cursor: hoverable ? 'pointer' : 'default',
      transition: 'border-color 150ms, box-shadow 150ms',
      boxShadow: hoverable && hover ? '0 4px 12px rgba(103,41,243,0.10)' : 'none',
      ...style
    }
  }, children);
}

// ---------- Avatar ----------
function Avatar({
  initials = 'AR',
  size = 32,
  color = '#6729F3',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      color: '#fff',
      fontFamily: "'Inter Tight', sans-serif",
      fontWeight: 600,
      fontSize: size * 0.38,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...style
    }
  }, initials);
}

// ---------- Brand mark ----------
function Mark({
  size = 28
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.28),
      background: '#6729F3',
      color: '#fff',
      fontFamily: "'Inter Tight', sans-serif",
      fontWeight: 700,
      fontSize: Math.round(size * 0.58),
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 1
    }
  }, "P");
}
Object.assign(window, {
  Icon,
  Button,
  Chip,
  Score,
  Card,
  Avatar,
  Mark
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ai-angles/components.jsx", error: String((e && e.message) || e) }); }

})();

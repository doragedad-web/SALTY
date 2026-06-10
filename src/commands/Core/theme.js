export const themes = {
  red: {
    name: "red",
    primary: 0xED4245,
    success: 0x57F287,
    warning: 0xFEE75C,
    error: 0xED4245,
  },

  neon: {
    name: "neon",
    primary: 0x00F5FF,
    success: 0x39FF14,
    warning: 0xFFEA00,
    error: 0xFF073A,
  },

  dark: {
    name: "dark",
    primary: 0x2B2D31,
    success: 0x3BA55C,
    warning: 0xFAA61A,
    error: 0xED4245,
  },
};

// default theme
export let activeTheme = themes.red;

export function setTheme(name) {
  if (!themes[name]) return false;
  activeTheme = themes[name];
  return true;
}

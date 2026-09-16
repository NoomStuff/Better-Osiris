export type ThemeMode = "dark" | "light";

export interface Theme {
   id: string;
   label: string;
   icon: string;
   motion: string;
}

/* Equivalent themes share their position across these two lists. Themes without an
   equivalent stay after the paired entries. */
export const THEMES_BY_MODE = {
   dark: [
      { id: "dark", label: "Dark", icon: "fa-solid fa-moon", motion: "rock" },
      { id: "frost", label: "Frost", icon: "fa-solid fa-snowflake", motion: "twirl" },
      { id: "espresso", label: "Espresso", icon: "fa-solid fa-mug-hot", motion: "tip" },
      { id: "moss", label: "Moss", icon: "fa-solid fa-leaf", motion: "flutter" },
      { id: "dusk", label: "Dusk", icon: "fa-solid fa-cloud-sun", motion: "drift" },
      { id: "ember", label: "Ember", icon: "fa-solid fa-fire", motion: "flicker" },
      { id: "abyss", label: "Abyss", icon: "fa-solid fa-water", motion: "wave" },
      { id: "noir", label: "Noir", icon: "fa-solid fa-hat-cowboy-side", motion: "hat-tip" },
      { id: "contrast", label: "Contrast", icon: "fa-solid fa-circle-half-stroke", motion: "snap" },
   ],
   light: [
      { id: "light", label: "Light", icon: "fa-solid fa-sun", motion: "spin" },
      { id: "thaw", label: "Thaw", icon: "fa-solid fa-snowflake", motion: "twirl" },
      { id: "latte", label: "Latte", icon: "fa-solid fa-mug-hot", motion: "tip" },
      { id: "ivy", label: "Ivy", icon: "fa-solid fa-leaf", motion: "flutter" },
      { id: "dawn", label: "Dawn", icon: "fa-solid fa-cloud-sun", motion: "drift" },
      { id: "flare", label: "Flare", icon: "fa-solid fa-fire", motion: "flicker" },
      { id: "bloom", label: "Bloom", icon: "fa-solid fa-spa", motion: "unfurl" },
      { id: "paper", label: "Paper", icon: "fa-solid fa-newspaper", motion: "page-turn" },
      { id: "osiris", label: "Osiris", icon: "fa-solid fa-graduation-cap", motion: "toss" },
   ],
} as const satisfies Record<ThemeMode, readonly Theme[]>;

export type ThemeId = (typeof THEMES_BY_MODE)[ThemeMode][number]["id"];

import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

// Storybook builds the stories with Vite. We add the Tailwind v4 plugin so the
// utilities used by the imported frontend components are generated from
// src/styles.css (which @source-scans ../frontend/src/components), and dedupe
// React so the components imported across the package boundary bind to this
// package's single React copy.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: { name: "@storybook/react-vite", options: {} },
  viteFinal: async (cfg) => {
    cfg.plugins = cfg.plugins ?? [];
    cfg.plugins.push(tailwindcss());
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.dedupe = [...(cfg.resolve.dedupe ?? []), "react", "react-dom"];
    return cfg;
  },
};

export default config;

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const REPO_NAME = "qrh"; // <- 如果你的仓库名不是 qrh，就改成实际仓库名

export default defineConfig({
  plugins: [react()],
  base: `/${REPO_NAME}/`,
});

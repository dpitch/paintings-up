// @ts-check

import { normalizePath } from "vite"
import fs from "node:fs/promises"
import path from "node:path"
import picocolors from "picocolors"
import browserslistToEsbuild from "browserslist-to-esbuild"
const { blue } = picocolors

const configPath = "framer.json"
const docsUrl = "https://framer.com/plugins/open"
const framerIconSvg = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld2JveD0iMCAwIDE2IDE2Ij48cGF0aCBkPSJNMyAxaDEwdjVIOFptMCA1aDVsNSA1SDNabTUgNXY1bC01LTVaIi8+PC9zdmc+`
const isProductionBuild = process.env.NODE_ENV === "production"

// Keep up-to-date with FramerStudio
const target = browserslistToEsbuild([
    ">0.25% and last 2 years and not dead and not OperaMobile > 1 and not Samsung > 1 and not UCAndroid > 1 and not FirefoxAndroid > 1 and not Android > 1 and not and_qq > 1 and not and_chr > 1 and not ios_saf > 1 and not op_mini all and not kaios > 1",
    "Firefox ESR",
    "unreleased Chrome versions",
    "unreleased Firefox versions",
    "unreleased Safari versions",
])

// credits to https://github.com/richardtallent/vite-plugin-singlefile/blob/main/src/index.ts#L109
function replaceScript(html, scriptFilename, scriptCode) {
    const reScript = new RegExp(`<script([^>]*?) src="[./]*${scriptFilename}"([^>]*)></script>`)
    const preloadMarker = /"?__VITE_PRELOAD__"?/g
    const newCode = scriptCode.replace(preloadMarker, "void 0")
    const inlined = html.replace(
        reScript,
        (_, beforeSrc, afterSrc) => `<script${beforeSrc}${afterSrc}>${newCode}</script>`,
    )
    return inlined
}

function replaceCss(html, scriptFilename, scriptCode) {
    const reStyle = new RegExp(`<link([^>]*?) href="[./]*${scriptFilename}"([^>]*?)>`)
    const legacyCharSetDeclaration = /@charset "UTF-8";/
    const inlined = html.replace(
        reStyle,
        (_, beforeSrc, afterSrc) =>
            `<style${beforeSrc}${afterSrc}>${scriptCode.replace(legacyCharSetDeclaration, "")}</style>`,
    )
    return inlined
}

/**
 * Framer Plugin Dev Server Plugin.
 *
 * @returns {import('vite').Plugin}
 */
const framerPlugin = () => {
    let config

    return {
        name: "vite-plugin-framer",
        enforce: "post",
        configureServer() {
            console.log(`\n${blue("➜")} Open your Plugin in Framer: ${blue(docsUrl)}`)
        },
        configResolved(_config) {
            config = _config
        },
        generateBundle: (_, bundle) => {
            if (!isProductionBuild) {
                return
            }

            /**
             * The main HTML has a brotli compressed size of around 1.4 kb, which leaves us around 11 kb to stay below 14 kb: https://web.dev/articles/extract-critical-css#14KB
             * The limit below reflects the non-compressed size, with brotli the real size is around 50% smaller (e.g. for 20 kb, the inlined size becomes <10kb)
             */
            let assetsInlineLimit = 20 * 1024 // 20 kb is enough to inline the default CSS + some authored CSS + some buffer

            const files = { js: [], css: [], html: [] }
            const isCSS = /\.css$/
            const isJS = /\.[mc]?js$/
            const isHTML = /\.html$/
            for (const i of Object.keys(bundle)) {
                if (isCSS.exec(i)) {
                    files.css.push(i)
                } else if (isJS.exec(i)) {
                    files.js.push(i)
                } else if (isHTML.exec(i)) {
                    files.html.push(i)
                }
            }

            const bundlesToDelete = []
            for (const name of files.html) {
                const htmlChunk = bundle[name]
                if (htmlChunk.type !== "asset") continue

                let replacedHtml = htmlChunk.source

                for (const filename of files.css) {
                    const cssChunk = bundle[filename]
                    if (cssChunk.type !== "asset") continue

                    const source = cssChunk.source

                    if (source != null && source.length < assetsInlineLimit) {
                        assetsInlineLimit -= source.length

                        bundlesToDelete.push(filename)
                        replacedHtml = replaceCss(replacedHtml, cssChunk.fileName, cssChunk.source)
                    }
                }

                // inline small JS bundles too if we have space left (in case there are any)
                for (const filename of files.js) {
                    const jsChunk = bundle[filename]
                    if (jsChunk.type !== "chunk") continue

                    const source = jsChunk.code
                    if (source != null && source.length < assetsInlineLimit) {
                        assetsInlineLimit -= source.length

                        bundlesToDelete.push(filename)
                        replacedHtml = replaceScript(replacedHtml, jsChunk.fileName, jsChunk.code)
                    }
                }
                htmlChunk.source = replacedHtml
            }

            for (const name of bundlesToDelete) {
                delete bundle[name]
            }
        },
        transformIndexHtml(html) {
            const errorDiv = `
      <div id="framer-environment-error" style="display: none;">
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewbox="0 0 20 20"><path d="M5 2.5h10v5h-5Zm0 5h5l5 5H5Zm5 5v5l-5-5Z"/></svg>
          <p>This is a Framer Plugin. Begin your development by opening this plugin within Framer. <a href="${docsUrl}">Learn More</a></p>
      </div>
      `

            const detectionScript = `
      <script>
      document.addEventListener('DOMContentLoaded', () => {
          // Framer Plugin development iframe detection
          if (window.self === window.top) {
              document.getElementById('framer-environment-error').style.display = 'flex';
          }
          // Override Favicon
          var link = document.querySelector("link[rel~='icon']");
          if (!link) {
              link = document.createElement('link');
              link.rel = 'icon';
              document.head.appendChild(link);
          }
          link.href = "${framerIconSvg}";
      });
      </script>
      `

            if (isProductionBuild) {
                // remove `crossorigin` from the script & link tags that are relative
                html = html
                    .replace(/<script type="module" crossorigin src="\//g, '<script type="module" src="/')
                    .replace(/<link rel="stylesheet" crossorigin href="\//g, '<link rel="stylesheet" href="/')
            }

            return html.replace("</body>", `${errorDiv}${detectionScript}</body>`)
        },
        config: () => ({
            assetsInclude: configPath,
            build: {
                target,
                rollupOptions: {
                    output: {
                        // override rollups default of storing `.js` files: https://github.com/framer/company/issues/30016
                        entryFileNames: "[name]-[hash].mjs",
                    },
                },
            },
            // https://github.com/vitejs/vite/issues/13756
            optimizeDeps: { esbuildOptions: { target } },
            server: { cors: true },
        }),
        async writeBundle() {
            const src = normalizePath(path.resolve(config.root, configPath))
            const dest = normalizePath(path.resolve(config.build.outDir, configPath))

            await fs.copyFile(src, dest)
        },
    }
}

export default framerPlugin

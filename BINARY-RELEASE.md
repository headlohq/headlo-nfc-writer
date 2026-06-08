# NFC Writer Binary Release — Setup Checklist

## 1. Install devDependencies (one time)
```
cd nfc-writer
npm install
```
This compiles the native `pcsclite.node` for your current OS and installs `esbuild` + `@yao-pkg/pkg`.

## 2. Test the build locally (Windows)
```
npm run build:win
```
Output: `nfc-writer/dist/headlo-nfc-writer.exe`

Test it runs:
```
dist\headlo-nfc-writer.exe
```

## 3. Set up Azure DevOps pipeline
- Go to Azure DevOps → Pipelines → New Pipeline
- Source: `headlo` repo
- YAML path: `nfc-writer/azure-pipeline.yml`
- Save (do not run yet)

## 4. Trigger the first build
Push a tag to kick off both Windows + macOS builds:
```
git tag nfc-v1.2.0
git push origin nfc-v1.2.0
```
Pipeline runs on both `windows-latest` and `macos-latest`, produces two artifacts.

## 5. Get the artifact download URLs
After the pipeline completes:
- Azure DevOps → Pipelines → the completed run → Artifacts
- Right-click each artifact → copy direct download URL

## 6. Update dashboard download links
In `headlo-app/src/pages/PluginSignerDashboard.tsx`, replace the two placeholder `href` URLs (search for `vsrm.dev.azure.com`) with the real artifact URLs from step 5.

## 7. Deploy
```
npm run build:react
wrangler pages deploy ...
```

---

## .env template for signers
Place next to the binary:
```
HEADLO_SIGNER_KEY=hdl_sk_...
NFC_SERVER_NAME=My NFC Station
# VITE_HEADLO_API_URL=https://api.headlo.com  (default, no need to set)
```

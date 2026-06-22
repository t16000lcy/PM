# 醫護版精準醫學檢驗報告結果諮詢平台

這是第一版靜態網站，可直接部署到 GitHub Pages。

## 資料更新

使用後台清理版 Excel 重新產生前端資料：

```powershell
& "C:\Users\t1600\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" `
  .\scripts\build_web_database.py `
  --input "C:\Users\t1600\Downloads\檢驗諮詢_基因變異資料庫_後台清理版_v3_full_summary.xlsx" `
  --output .\web\data
```

前台只會顯示 `review_status = approved` 的資料。

## 本機預覽

從專案根目錄啟動靜態伺服器：

```powershell
& "C:\Users\t1600\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" `
  -m http.server 8080 -d .\web
```

然後開啟：

```text
http://127.0.0.1:8080/
```

## GitHub Pages

建議把整個專案推到 GitHub，並在 repository 的 Pages 設定中選擇：

- Source: GitHub Actions
- Workflow: `.github/workflows/deploy-pages.yml`

每次推送到 `main` 分支後，GitHub 會部署 `web/` 目錄。

## AI 小助理目前模式

第一版小助理是「資料庫檢索 + 六卡片模板」，不會呼叫外部 AI API，因此可以安全部署在 GitHub Pages。

若未來要串 OpenAI API，請改用 Vercel / Cloud Run / Render 之類的後端服務保護 API key，不要把 key 放在前端。

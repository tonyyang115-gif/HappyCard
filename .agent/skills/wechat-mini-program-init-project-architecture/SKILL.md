---
name: wechat-mini-program-init-project-architecture
description: "Bootstrap WeChat Mini Program foundations with Skyline renderer, glass-easel config, and global app structure. Use when creating a new mini program, scaffolding project architecture, or resetting app.json/app.js/app.wxss baselines."
---

# Project Architecture Initialization

Automatically sets up the global architecture for WeChat Mini Programs (Skyline ready).

## When to use this skill

- User says: "create a new miniprogram", "initialize project", "start new app"
- Keywords: new, init, scaffold, project, architecture, skyline
- At the start of any new WeChat Mini Program project

## What this skill does

1. Generates `app.json` with Skyline and glass-easel support
2. Generates `app.js` with clean lifecycle management
3. Creates modern folder structure
4. Sets up `app.wxss` for global styles (including legacy scrollbar hiding)

## Implementation

### Step 1: Generate app.json

```json
{
  "pages": [
    "pages/index/index"
  ],
  "window": {
    "navigationStyle": "custom",
    "backgroundColor": "#F7F8FA",
    "navigationBarTextStyle": "black"
  },
  "lazyCodeLoading": "requiredComponents",
  "renderer": "skyline",
  "rendererOptions": {
    "skyline": {
      "defaultDisplayBlock": true,
      "defaultContentBox": true,
      "componentFramework": "glass-easel"
    }
  },
  "componentFramework": "glass-easel",
  "sitemapLocation": "sitemap.json"
}
```

### Step 2: Generate app.wxss

```css
/* Global Styles */
page {
  --primary-color: #07C160;
  --bg-color: #F7F8FA;
}

/* 
 * Legacy Scrollbar Hiding for WebView compatibility 
 * (Skyline uses show-scrollbar attribute)
 */
::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
  color: transparent;
}
```

### Step 3: Generate app.js

```javascript
App({
  onLaunch() {
    console.log('App Launch - Renderer:', this.renderer);
  }
});
```

## Important rules

- ✅ Enable `lazyCodeLoading` for performance
- ✅ Use `glass-easel` framework
- ✅ "renderer": "skyline" is mandatory

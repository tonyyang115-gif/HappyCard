#!/usr/bin/env node

/**
 * WeChat Mini Program Agent Skills Installer
 * 一键安装所有技能到 .agent/skills/ 目录
 * 
 * 使用方法:
 * 1. 将此文件保存为 install-skills.js
 * 2. 在项目根目录运行: node install-skills.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 技能定义
const SKILLS = {
  'init-project-architecture': {
    description: 'Initializes WeChat Mini Program global architecture with Skyline support and official navigation patterns. Use when user says "new project", "create miniprogram", "initialize", or "scaffold project".',
    content: `# Project Architecture Initialization

Automatically sets up the global architecture for WeChat Mini Programs (Skyline ready).

## When to use this skill

- User says: "create a new miniprogram", "initialize project", "start new app"
- Keywords: new, init, scaffold, project, architecture, skyline
- At the start of any new WeChat Mini Program project

## What this skill does

1. Generates \`app.json\` with Skyline and glass-easel support
2. Generates \`app.js\` with clean lifecycle management
3. Creates modern folder structure
4. Sets up \`app.wxss\` for global styles (including legacy scrollbar hiding)

## Implementation

### Step 1: Generate app.json

\`\`\`json
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
\`\`\`

### Step 2: Generate app.wxss

\`\`\`css
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
\`\`\`

### Step 3: Generate app.js

\`\`\`javascript
App({
  onLaunch() {
    console.log('App Launch - Renderer:', this.renderer);
  }
});
\`\`\`

## Important rules

- ✅ Enable \`lazyCodeLoading\` for performance
- ✅ Use \`glass-easel\` framework
- ✅ "renderer": "skyline" is mandatory
`
  },

  'generate-page': {
    description: 'Generates Skyline-optimized pages with `Component` constructor, native scrollbar hiding, and grid layouts. Use for "create page", "list", "feed".',
    content: `# Skyline Page Generator

Generates high-performance pages optimized for the Skyline rendering engine.

## When to use this skill

- User says: "create a page", "add list", "waterfall layout", "horizontal list"
- Keywords: page, list, grid, waterfall, scroll

## Templates

### 1. Basic List Page (Vertical)

\`\`\`xml
<!-- pages/list/list.wxml -->
<navigation-bar title="List" back="{{true}}"></navigation-bar>

<!-- show-scrollbar="{{false}}" hides vertical scrollbar natively in Skyline -->
<scroll-view 
  type="list" 
  scroll-y 
  show-scrollbar="{{false}}" 
  class="scroll-area"
>
  <view class="item" wx:for="{{100}}">Item {{index}}</view>
</scroll-view>
\`\`\`

### 2. Horizontal Scroll (Hidden Bar)

\`\`\`xml
<!-- show-scrollbar="{{false}}" hides horizontal scrollbar natively in Skyline -->
<scroll-view 
  type="list" 
  scroll-x 
  show-scrollbar="{{false}}" 
  class="horizontal-scroll"
>
  <view class="card" wx:for="{{10}}">Card {{index}}</view>
</scroll-view>
\`\`\`

### 3. Waterfall Layout (Grid View)

\`\`\`xml
<scroll-view type="custom" scroll-y show-scrollbar="{{false}}" class="scroll-area">
  <grid-view type="masonry" main-axis-gap="10" cross-axis-gap="10">
    <view class="grid-item" wx:for="{{list}}">
      <image src="{{item.img}}" mode="widthFix" class="img" />
      <text>{{item.title}}</text>
    </view>
  </grid-view>
</scroll-view>
\`\`\`

## Important rules

- ✅ STRICTLY use \`Component\` constructor in JS
- ✅ Use \`show-scrollbar="{{false}}"\` for BOTH vertical and horizontal
- ✅ Use \`type="list"\` for standard lists
- ✅ Use \`type="custom"\` + \`grid-view\` for waterfalls
`
  },

  'integrate-ai-agent': {
    description: 'Integrates WeChat Cloud AI Agent capabilities. Use when user mentions "AI", "Agent", "Bot", "Check code", or "DeepSeek" integration.',
    content: `# AI Agent Integration

Integrates the official WeChat Cloud AI+ capability (Agent).

## When to use this skill

- User says: "add AI chat", "integrate agent", "use DeepSeek", "create bot"
- Keywords: AI, Agent, Bot, LLM, Cloud Capability

## Implementation

### Step 1: Client Side Integration (Frontend)

\`\`\`javascript
// In your page or component
const { AI } = wx.cloud.extend;

Component({
  methods: {
    async sendMessage(text) {
      try {
        const res = await AI.bot.sendMessage({
          botId: 'YOUR_BOT_ID', // Get from WeChat Cloud Console
          msg: text,
          history: this.data.history || [] // Optional chat history
        });

        // Handle stream response or text response
        for await (const chunk of res.eventStream) {
           console.log(chunk); 
           // Update UI with chunk.text
        }
      } catch (error) {
        console.error('AI Error:', error);
      }
    }
  }
});
\`\`\`

### Step 2: Configuration

Ensure your \`project.config.json\` or \`app.json\` has cloud enabled.

### Step 3: Cloud Function (Optional Wrapper)

If you need backend security or preprocessing:

\`\`\`javascript
// cloudfunctions/askAgent/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { AI } = cloud.extend;
  const res = await AI.bot.sendMessage({
    botId: 'YOUR_BOT_ID',
    msg: event.text
  });
  return res;
};
\`\`\`

## Important rules

- ✅ Requires WeChat Lib 3.7.1+
- ✅ Get Bot ID from WeChat Developers Tool -> Cloud -> AI Agents
- ✅ Streaming is supported via \`eventStream\`
`
  },

  'advanced-ui-design': {
    description: 'Creates iOS-native quality UI components with micro-interactions and animations. Use when user mentions "beautiful UI", "modern design", "button", "card", "modal", "animation", or requests native-feeling components.',
    content: `# Advanced UI Design System

Generates production-ready UI components following iOS Human Interface Guidelines.

## When to use this skill

- User says: "create a button", "design a card", "build a modal"
- Keywords: UI, component, design, beautiful, modern, native, animation

## Design Tokens

\`\`\`css
/* Colors */
--primary: #667eea;
--success: #10b981;
--danger: #ef4444;
--bg-page: #F7F8FA;
--text-primary: #1A1A1A;

/* Shadows */
--shadow-sm: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
--shadow-md: 0 8rpx 32rpx rgba(0, 0, 0, 0.08);
\`\`\`

## Component: Button

\`\`\`xml
<button class="btn primary" hover-class="btn-active">
  <text>{{text}}</text>
</button>
\`\`\`

\`\`\`css
.btn {
  border-radius: 12rpx;
  padding: 28rpx 48rpx;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn.primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #FFFFFF;
  box-shadow: 0 8rpx 24rpx rgba(102, 126, 234, 0.3);
}

.btn-active {
  transform: scale(0.96);
}
\`\`\`

## Component: Card

\`\`\`css
.card {
  background: #FFFFFF;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.05);
  margin-bottom: 24rpx;
}
\`\`\`

## Important rules

- ❌ NO physical borders (use shadows)
- ✅ All animations use \`cubic-bezier(0.4, 0, 0.2, 1)\`
- ✅ Add accessibility attributes
- ❌ NEVER use emoji as icons (use SVG)
`
  },

  'database-schema-design': {
    description: 'Designs cloud database schemas with indexes, permissions, and auto-generates CRUD functions. Use when user mentions "database", "data model", "collection", "schema", or describes data structures.',
    content: `# Database Schema Designer

Automatically designs optimized database schemas for WeChat Cloud Base.

## When to use this skill

- User says: "create database", "design schema", "need data model"
- Keywords: database, collection, schema, data, model, store

## Schema Template

\`\`\`json
{
  "_id": "auto",
  "_openid": "string (auto)",
  "title": {
    "type": "string",
    "required": true,
    "maxLength": 100
  },
  "content": {
    "type": "string",
    "required": true
  },
  "status": {
    "type": "number",
    "enum": [0, 1, 2],
    "default": 0
  },
  "created_at": {
    "type": "date",
    "default": "$serverDate"
  }
}
\`\`\`

## Permission Rules

\`\`\`json
{
  "read": "doc._openid == auth.openid || doc.status == 1",
  "write": "doc._openid == auth.openid",
  "create": true,
  "delete": "doc._openid == auth.openid"
}
\`\`\`

## CRUD Cloud Function Template

\`\`\`javascript
const cloud = require('wx-server-sdk');
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  
  const data = {
    ...event.data,
    _openid: wxContext.OPENID,
    created_at: db.serverDate()
  };
  
  return await db.collection('posts').add({data});
};
\`\`\`

## Important rules

- ⚠️ NEVER let frontend pass openid
- ✅ ALWAYS use atomic operations
- ✅ Add indexes for frequently queried fields
`
  },

  'performance-optimizer': {
    description: 'Analyzes and fixes performance issues like excessive setData, unoptimized lists, and slow cloud functions. Use when user mentions "slow", "laggy", "performance", "optimize", or "improve speed".',
    content: `# Performance Optimization Engine

Automatically detects and fixes common performance bottlenecks.

## When to use this skill

- User says: "app is slow", "page is laggy", "optimize performance"
- Keywords: slow, lag, freeze, optimize, performance, speed

## Performance Checks

### 1. setData Optimization

**Issue: Frequent calls**
\`\`\`javascript
// ❌ Before
this.setData({a: 1});
this.setData({b: 2});
this.setData({c: 3});

// ✅ After
this.setData({a: 1, b: 2, c: 3});
\`\`\`

**Issue: Large data**
\`\`\`javascript
// ❌ Before
this.setData({list: newList});

// ✅ After
this.setData({
  [\`list[\${index}].name\`]: newName
});
\`\`\`

### 2. List Rendering

\`\`\`xml
<!-- ❌ Before -->
<view wx:for="{{longList}}">{{item}}</view>

<!-- ✅ After -->
<scroll-view type="list" enable-flex scroll-y>
  <view wx:for="{{longList}}" wx:key="id">{{item}}</view>
</scroll-view>
\`\`\`

### 3. Image Optimization

\`\`\`xml
<!-- ❌ Before -->
<image src="{{url}}" />

<!-- ✅ After -->
<image src="{{url}}" lazy-load mode="aspectFill" webp />
\`\`\`

## Output

- Performance analysis report
- List of auto-fixed files
- Manual fix recommendations
- Expected performance gains
`
  },

  'code-refactor-engine': {
    description: 'Modernizes legacy code by migrating deprecated APIs to current standards. Use when user mentions "refactor", "upgrade", "modernize", "migrate", or when detecting old API patterns.',
    content: `# Code Refactoring Engine

Automatically upgrades legacy code to modern standards.

## When to use this skill

- User says: "refactor code", "upgrade to latest API", "modernize app"
- Keywords: refactor, upgrade, migrate, legacy, old, modernize

## API Migrations

### wx.getSystemInfo → wx.getWindowInfo

\`\`\`javascript
// ❌ Before
wx.getSystemInfo({
  success(res) {
    const {statusBarHeight} = res;
  }
});

// ✅ After
const {statusBarHeight} = wx.getWindowInfo();
\`\`\`

### Callback → Async/Await

\`\`\`javascript
// ❌ Before
wx.cloud.callFunction({
  name: 'test',
  success(res) {
    console.log(res);
  }
});

// ✅ After
const res = await wx.cloud.callFunction({name: 'test'});
\`\`\`

### wx.chooseImage → wx.chooseMedia

\`\`\`javascript
// ❌ Before
wx.chooseImage({count: 9});

// ✅ After
wx.chooseMedia({count: 9, mediaType: ['image']});
\`\`\`

## Important rules

- ✅ ALWAYS create backups before refactoring
- ✅ Apply changes incrementally
- ✅ Test after each phase
`
  },

  'diagnose-and-fix': {
    description: 'Intelligently diagnoses and fixes common errors including navigation issues, cloud function failures, and permission errors. Use when user reports bugs or unexpected behavior.',
    content: `# Intelligent Error Diagnosis & Fix

Automatically detects, analyzes, and fixes common issues.

## When to use this skill

- User says: "error", "bug", "not working", "broken", "issue"
- Keywords: error, crash, fail, broken, bug, issue, problem

## Common Issues

### 1. Navigation Bar Height Wrong

**Checks:**
- ✓ app.js contains navBarHeight calculation
- ✓ Page has navigation placeholder view

**Auto-fix:**
\`\`\`xml
<view style="height: {{navBarHeight}}px;"></view>
\`\`\`

### 2. Cloud Function OpenAPI Error

**Checks:**
- ✓ config.json exists
- ✓ permissions.openapi is configured

**Auto-fix:**
\`\`\`json
{
  "permissions": {
    "openapi": ["security.msgSecCheck"]
  }
}
\`\`\`

### 3. Database Permission Denied

**Checks:**
- ✓ Cloud function uses cloud.getWXContext()
- ✓ Frontend doesn't pass openid

**Auto-fix:**
\`\`\`javascript
const wxContext = cloud.getWXContext();
const openid = wxContext.OPENID; // ✅ Secure
\`\`\`

### 4. Performance Issues

**Triggers:** performance-optimizer skill

### 5. Content Covered by Nav/Video

**Auto-fix:**
\`\`\`xml
<!-- Use native component -->
<page-container show="{{show}}" position="bottom" round>
  <view>Content</view>
</page-container>
\`\`\`

## Output

- Error diagnosis report
- Root cause analysis
- Auto-fix code
- Verification steps
`
  },

  'select-native-component': {
    description: 'Recommends the best native WeChat component for specific UI scenarios. Use when user describes UI needs like popups, lists, pickers, or media upload.',
    content: `# Native Component Selector

Intelligently recommends official WeChat components.

## When to use this skill

- User says: "create a popup", "build a list", "add image upload"
- Keywords: popup, modal, list, picker, upload, select, choose

## Component Recommendations

### Popups & Modals

| Intent | ✅ Use Native | Key Props |
|--------|--------------|-----------|
| Half-screen popup | \`<page-container>\` | \`position="bottom"\`, \`round\` |
| Full overlay | \`<root-portal>\` | \`enable\` |
| Alert dialog | \`wx.showModal()\` | \`title\`, \`content\` |

### Lists

| Intent | ✅ Use Native | When |
|--------|--------------|------|
| Scrollable list | \`<scroll-view>\` | Always |
| Long list (100+) | \`<scroll-view type="list">\` | Performance |
| Pull to refresh | \`refresher-enabled\` | Built-in |

### Media Upload

\`\`\`javascript
// ✅ Unified API for image/video
const res = await wx.chooseMedia({
  count: 9,
  mediaType: ['image', 'video'],
  sizeType: ['compressed']
});
\`\`\`

### Pickers

| Type | Component | Mode |
|------|-----------|------|
| Date | \`<picker>\` | \`mode="date"\` |
| Time | \`<picker>\` | \`mode="time"\` |
| Region | \`<picker>\` | \`mode="region"\` |

### User Data (Privacy Compliant)

\`\`\`xml
<!-- Avatar -->
<button open-type="chooseAvatar" bindchooseavatar="onChooseAvatar">
  <image src="{{avatar}}"></image>
</button>

<!-- Nickname -->
<input type="nickname" placeholder="请输入昵称" />
\`\`\`

## Important rules

- ✅ ALWAYS prefer native components
- ❌ NEVER use deprecated APIs
- ❌ NEVER build custom date/region pickers
`
  },

  'generate-cloud-function': {
    description: 'Generates complete cloud functions with the required trinity files (index.js, package.json, config.json). Use when user needs backend logic or server-side operations.',
    content: `# Cloud Function Generator

Automatically creates production-ready cloud functions.

## When to use this skill

- User says: "create cloud function", "backend logic", "server-side code"
- Keywords: cloud function, API, backend, server, database operation

## The Trinity Files

Every cloud function MUST have 3 files:

1. **index.js** - Main logic
2. **package.json** - Dependencies
3. **config.json** - Permissions ⚠️ CRITICAL

## Templates

### Database CRUD

\`\`\`javascript
// index.js
const cloud = require('wx-server-sdk');
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  
  const data = {
    ...event.data,
    _openid: wxContext.OPENID,  // ✅ Secure
    created_at: db.serverDate()
  };
  
  try {
    const result = await db.collection('posts').add({data});
    return {success: true, id: result._id};
  } catch (err) {
    return {success: false, error: err.message};
  }
};
\`\`\`

### OpenAPI (Content Check)

\`\`\`javascript
// index.js
exports.main = async (event) => {
  const {content} = event;
  
  const result = await cloud.openapi.security.msgSecCheck({
    content,
    version: 2,
    scene: 2,
    openid: cloud.getWXContext().OPENID
  });
  
  if (result.result.suggest === 'risky') {
    return {success: false, error: 'content_risky'};
  }
  
  return {success: true};
};
\`\`\`

\`\`\`json
// config.json - REQUIRED for OpenAPI
{
  "permissions": {
    "openapi": ["security.msgSecCheck"]
  },
  "timeout": 15
}
\`\`\`

## Important rules

- ⚠️ NEVER trust frontend openid (get from cloud.getWXContext())
- ✅ ALWAYS use atomic operations
- ✅ ALWAYS validate input
- ❌ NEVER forget config.json when using OpenAPI
`
  },

  'generate-ui-styles': {
    description: 'Generates minimalist, iOS-native quality WXSS styles. Use when user needs styling for cards, buttons, inputs, or mentions visual design.',
    content: `# UI Style Generator

Creates production-ready WXSS styles following iOS design principles.

## When to use this skill

- User says: "style this component", "make it look better"
- Keywords: style, CSS, design, beautiful, modern

## Design Tokens

\`\`\`css
/* Colors */
--primary: #667eea;
--bg-page: #F7F8FA;
--bg-card: #FFFFFF;
--text-primary: #1A1A1A;
--text-secondary: #999999;

/* Shadows */
--shadow-sm: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
--shadow-md: 0 8rpx 32rpx rgba(0, 0, 0, 0.08);

/* Spacing */
--spacing-sm: 16rpx;
--spacing-md: 24rpx;
--spacing-lg: 32rpx;
\`\`\`

## Component Styles

### Card
\`\`\`css
.card {
  background: #FFFFFF;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.05);
  margin-bottom: 24rpx;
}
\`\`\`

### Button
\`\`\`css
.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #FFFFFF;
  border-radius: 12rpx;
  padding: 28rpx 48rpx;
  box-shadow: 0 8rpx 24rpx rgba(102, 126, 234, 0.3);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
\`\`\`

### Input
\`\`\`css
.input-field {
  background: #F7F8FA;
  border: none;
  border-radius: 12rpx;
  padding: 28rpx 32rpx;
  font-size: 30rpx;
}
\`\`\`

## Safe Area
\`\`\`css
.fixed-bottom {
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
}
\`\`\`

## Important rules

- ❌ NO physical borders (use shadows)
- ✅ Always use rpx units
- ✅ Add transitions for interactive elements
`
  }
};

// 安装脚本
function installSkills() {
  const baseDir = path.join(process.cwd(), '.agent', 'skills');

  console.log('🚀 WeChat Mini Program Agent Skills Installer\n');

  // 创建基础目录
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
    console.log('✅ Created .agent/skills/ directory');
  }

  // 安装每个技能
  let installedCount = 0;
  Object.entries(SKILLS).forEach(([skillName, skillData]) => {
    const skillDir = path.join(baseDir, skillName);

    // 创建技能目录
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    // 创建子目录
    ['templates', 'examples', 'scripts', 'resources'].forEach(subdir => {
      const subdirPath = path.join(skillDir, subdir);
      if (!fs.existsSync(subdirPath)) {
        fs.mkdirSync(subdirPath, { recursive: true });
      }
    });

    // 写入 SKILL.md
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const frontmatter = `---
name: ${skillName}
description: ${skillData.description}
---

`;

    fs.writeFileSync(skillMdPath, frontmatter + skillData.content);
    installedCount++;
    console.log(`✅ Installed: ${skillName}`);
  });

  console.log(`\n🎉 Successfully installed ${installedCount} skills!\n`);
  console.log('📁 Directory structure:');
  console.log(`
.agent/skills/
${Object.keys(SKILLS).map(name => `├── ${name}/
│   ├── SKILL.md
│   ├── templates/
│   ├── examples/
│   ├── scripts/
│   └── resources/`).join('\n')}
  `);

  console.log('\n📖 Next steps:');
  console.log('1. Review each SKILL.md file');
  console.log('2. Add templates to templates/ directories');
  console.log('3. Add example code to examples/ directories');
  console.log('4. Your agent is ready to use these skills!\n');
}

// 运行安装
// 运行安装
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  installSkills();
}

export { SKILLS, installSkills };
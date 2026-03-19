---
name: wechat-mini-program-diagnose-and-fix
description: "Troubleshoot and fix common mini program runtime, navigation, cloud-function, and permission issues with root-cause guidance. Use when users report bugs, errors, broken flows, unexpected behavior, or need actionable debugging fixes."
---

# Intelligent Error Diagnosis & Fix

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
```xml
<view style="height: {{navBarHeight}}px;"></view>
```

### 2. Cloud Function OpenAPI Error

**Checks:**
- ✓ config.json exists
- ✓ permissions.openapi is configured

**Auto-fix:**
```json
{
  "permissions": {
    "openapi": ["security.msgSecCheck"]
  }
}
```

### 3. Database Permission Denied

**Checks:**
- ✓ Cloud function uses cloud.getWXContext()
- ✓ Frontend doesn't pass openid

**Auto-fix:**
```javascript
const wxContext = cloud.getWXContext();
const openid = wxContext.OPENID; // ✅ Secure
```

### 4. Performance Issues

**Triggers:** performance-optimizer skill

### 5. Content Covered by Nav/Video

**Auto-fix:**
```xml
<!-- Use native component -->
<page-container show="{{show}}" position="bottom" round>
  <view>Content</view>
</page-container>
```

## Output

- Error diagnosis report
- Root cause analysis
- Auto-fix code
- Verification steps

---
name: code-refactor-engine
description: Modernizes legacy code by migrating deprecated APIs to current standards. Use when user mentions "refactor", "upgrade", "modernize", "migrate", or when detecting old API patterns.
---

# Code Refactoring Engine

Automatically upgrades legacy code to modern standards.

## When to use this skill

- User says: "refactor code", "upgrade to latest API", "modernize app"
- Keywords: refactor, upgrade, migrate, legacy, old, modernize

## API Migrations

### wx.getSystemInfo → wx.getWindowInfo

```javascript
// ❌ Before
wx.getSystemInfo({
  success(res) {
    const {statusBarHeight} = res;
  }
});

// ✅ After
const {statusBarHeight} = wx.getWindowInfo();
```

### Callback → Async/Await

```javascript
// ❌ Before
wx.cloud.callFunction({
  name: 'test',
  success(res) {
    console.log(res);
  }
});

// ✅ After
const res = await wx.cloud.callFunction({name: 'test'});
```

### wx.chooseImage → wx.chooseMedia

```javascript
// ❌ Before
wx.chooseImage({count: 9});

// ✅ After
wx.chooseMedia({count: 9, mediaType: ['image']});
```

## Important rules

- ✅ ALWAYS create backups before refactoring
- ✅ Apply changes incrementally
- ✅ Test after each phase

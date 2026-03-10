---
name: select-native-component
description: Recommends the best native WeChat component for specific UI scenarios. Use when user describes UI needs like popups, lists, pickers, or media upload.
---

# Native Component Selector

Intelligently recommends official WeChat components.

## When to use this skill

- User says: "create a popup", "build a list", "add image upload"
- Keywords: popup, modal, list, picker, upload, select, choose

## Component Recommendations

### Popups & Modals

| Intent | ✅ Use Native | Key Props |
|--------|--------------|-----------|
| Half-screen popup | `<page-container>` | `position="bottom"`, `round` |
| Full overlay | `<root-portal>` | `enable` |
| Alert dialog | `wx.showModal()` | `title`, `content` |

### Lists

| Intent | ✅ Use Native | When |
|--------|--------------|------|
| Scrollable list | `<scroll-view>` | Always |
| Long list (100+) | `<scroll-view type="list">` | Performance |
| Pull to refresh | `refresher-enabled` | Built-in |

### Media Upload

```javascript
// ✅ Unified API for image/video
const res = await wx.chooseMedia({
  count: 9,
  mediaType: ['image', 'video'],
  sizeType: ['compressed']
});
```

### Pickers

| Type | Component | Mode |
|------|-----------|------|
| Date | `<picker>` | `mode="date"` |
| Time | `<picker>` | `mode="time"` |
| Region | `<picker>` | `mode="region"` |

### User Data (Privacy Compliant)

```xml
<!-- Avatar -->
<button open-type="chooseAvatar" bindchooseavatar="onChooseAvatar">
  <image src="{{avatar}}"></image>
</button>

<!-- Nickname -->
<input type="nickname" placeholder="请输入昵称" />
```

## Important rules

- ✅ ALWAYS prefer native components
- ❌ NEVER use deprecated APIs
- ❌ NEVER build custom date/region pickers

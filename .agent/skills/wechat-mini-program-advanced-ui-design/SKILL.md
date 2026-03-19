---
name: wechat-mini-program-advanced-ui-design
description: "Design polished mini program UI components with iOS-like visual quality, motion tokens, and reusable style patterns. Use when requests focus on beautiful UI, modern components, buttons, cards, modals, animation, or native-feeling UX."
---

# Advanced UI Design System

Generates production-ready UI components following iOS Human Interface Guidelines.

## When to use this skill

- User says: "create a button", "design a card", "build a modal"
- Keywords: UI, component, design, beautiful, modern, native, animation

## Design Tokens

```css
/* Colors */
--primary: #667eea;
--success: #10b981;
--danger: #ef4444;
--bg-page: #F7F8FA;
--text-primary: #1A1A1A;

/* Shadows */
--shadow-sm: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
--shadow-md: 0 8rpx 32rpx rgba(0, 0, 0, 0.08);
```

## Component: Button

```xml
<button class="btn primary" hover-class="btn-active">
  <text>{{text}}</text>
</button>
```

```css
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
```

## Component: Card

```css
.card {
  background: #FFFFFF;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.05);
  margin-bottom: 24rpx;
}
```

## Important rules

- ❌ NO physical borders (use shadows)
- ✅ All animations use `cubic-bezier(0.4, 0, 0.2, 1)`
- ✅ Add accessibility attributes
- ❌ NEVER use emoji as icons (use SVG)

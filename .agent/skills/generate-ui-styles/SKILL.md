---
name: generate-ui-styles
description: Generates minimalist, iOS-native quality WXSS styles. Use when user needs styling for cards, buttons, inputs, or mentions visual design.
---

# UI Style Generator

Creates production-ready WXSS styles following iOS design principles.

## When to use this skill

- User says: "style this component", "make it look better"
- Keywords: style, CSS, design, beautiful, modern

## Design Tokens

```css
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
```

## Component Styles

### Card
```css
.card {
  background: #FFFFFF;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.05);
  margin-bottom: 24rpx;
}
```

### Button
```css
.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #FFFFFF;
  border-radius: 12rpx;
  padding: 28rpx 48rpx;
  box-shadow: 0 8rpx 24rpx rgba(102, 126, 234, 0.3);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Input
```css
.input-field {
  background: #F7F8FA;
  border: none;
  border-radius: 12rpx;
  padding: 28rpx 32rpx;
  font-size: 30rpx;
}
```

## Safe Area
```css
.fixed-bottom {
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
}
```

## Important rules

- ❌ NO physical borders (use shadows)
- ✅ Always use rpx units
- ✅ Add transitions for interactive elements

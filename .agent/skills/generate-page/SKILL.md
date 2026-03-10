---
name: generate-page
description: Generates Skyline-optimized pages with `Component` constructor, native scrollbar hiding, and grid layouts. Use for "create page", "list", "feed".
---

# Skyline Page Generator

Generates high-performance pages optimized for the Skyline rendering engine.

## When to use this skill

- User says: "create a page", "add list", "waterfall layout", "horizontal list"
- Keywords: page, list, grid, waterfall, scroll

## Templates

### 1. Basic List Page (Vertical)

```xml
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
```

### 2. Horizontal Scroll (Hidden Bar)

```xml
<!-- show-scrollbar="{{false}}" hides horizontal scrollbar natively in Skyline -->
<scroll-view 
  type="list" 
  scroll-x 
  show-scrollbar="{{false}}" 
  class="horizontal-scroll"
>
  <view class="card" wx:for="{{10}}">Card {{index}}</view>
</scroll-view>
```

### 3. Waterfall Layout (Grid View)

```xml
<scroll-view type="custom" scroll-y show-scrollbar="{{false}}" class="scroll-area">
  <grid-view type="masonry" main-axis-gap="10" cross-axis-gap="10">
    <view class="grid-item" wx:for="{{list}}">
      <image src="{{item.img}}" mode="widthFix" class="img" />
      <text>{{item.title}}</text>
    </view>
  </grid-view>
</scroll-view>
```

## Important rules

- ✅ STRICTLY use `Component` constructor in JS
- ✅ Use `show-scrollbar="{{false}}"` for BOTH vertical and horizontal
- ✅ Use `type="list"` for standard lists
- ✅ Use `type="custom"` + `grid-view` for waterfalls

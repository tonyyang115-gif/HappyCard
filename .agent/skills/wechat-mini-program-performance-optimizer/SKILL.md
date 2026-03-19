---
name: wechat-mini-program-performance-optimizer
description: "Diagnose and optimize mini program performance issues across setData usage, list rendering, image loading, and cloud calls. Use when users report lag, slowness, freezes, dropped frames, or request speed and responsiveness improvements."
---

# Performance Optimization Engine

Automatically detects and fixes common performance bottlenecks.

## When to use this skill

- User says: "app is slow", "page is laggy", "optimize performance"
- Keywords: slow, lag, freeze, optimize, performance, speed

## Performance Checks

### 1. setData Optimization

**Issue: Frequent calls**
```javascript
// ❌ Before
this.setData({a: 1});
this.setData({b: 2});
this.setData({c: 3});

// ✅ After
this.setData({a: 1, b: 2, c: 3});
```

**Issue: Large data**
```javascript
// ❌ Before
this.setData({list: newList});

// ✅ After
this.setData({
  [`list[${index}].name`]: newName
});
```

### 2. List Rendering

```xml
<!-- ❌ Before -->
<view wx:for="{{longList}}">{{item}}</view>

<!-- ✅ After -->
<scroll-view type="list" enable-flex scroll-y>
  <view wx:for="{{longList}}" wx:key="id">{{item}}</view>
</scroll-view>
```

### 3. Image Optimization

```xml
<!-- ❌ Before -->
<image src="{{url}}" />

<!-- ✅ After -->
<image src="{{url}}" lazy-load mode="aspectFill" webp />
```

## Output

- Performance analysis report
- List of auto-fixed files
- Manual fix recommendations
- Expected performance gains

Component({
    properties: {
        url: String,
        alt: String,
        size: {
            type: String,
            value: 'md'
        },
        className: String
    },
    data: {
        sizeMap: {
            xs: 24,
            sm: 32,
            md: 40,
            lg: 48,
            xl: 80
        }
    },
    methods: {
        onImageError(e) {
            console.error('Avatar load error, falling back:', this.data.url);
            this.setData({
                url: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YWqJCn1aYSnS7S14E3Yn3Q/0' // WeChat default grey avatar
            });
        }
    }
})

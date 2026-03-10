Component({
    properties: {
        variant: {
            type: String,
            value: 'primary' // primary | secondary | danger | ghost
        },
        size: {
            type: String,
            value: 'md' // sm | md | lg
        },
        fullWidth: {
            type: Boolean,
            value: false
        },
        className: String,
        style: String,
        openType: String
    },
    methods: {
        handleTap(e) {
            if (!this.data.openType) {
                this.triggerEvent('click', e);
            }
        },
        onGetUserInfo(e) {
            this.triggerEvent('getuserinfo', e);
        }
    }
})

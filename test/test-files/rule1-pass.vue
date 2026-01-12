<template>
  <div>
    <!-- 规则1通过：新增按钮调用接口且实现了防重复提交 -->
    <el-button @click="handleSubmit" :disabled="isSubmitting">提交表单</el-button>
  </div>
</template>

<script>
export default {
  data() {
    return {
      isSubmitting: false
    }
  },
  methods: {
    handleSubmit() {
      if (this.isSubmitting) return;
      this.isSubmitting = true;
      
      this.$http.post('/api/submit', { data: 'test' })
        .then(res => {
          console.log('提交成功', res);
        })
        .finally(() => {
          this.isSubmitting = false;
        });
    }
  }
}
</script>


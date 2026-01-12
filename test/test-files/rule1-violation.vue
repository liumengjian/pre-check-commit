<template>
  <div>
    <!-- 规则1违规：新增按钮调用接口但未实现防重复提交 -->
    <el-button @click="handleSubmit">提交表单</el-button>
  </div>
</template>

<script>
export default {
  methods: {
    handleSubmit() {
      // 调用接口但未实现防重复提交保护
      this.$http.post('/api/submit', { data: 'test' })
        .then(res => {
          console.log('提交成功', res);
        });
    }
  }
}
</script>


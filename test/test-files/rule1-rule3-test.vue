<template>
  <div>
    <el-button @click="handleSubmit">提交</el-button>
  </div>
</template>

<script>
export default {
  methods: {
    handleSubmit() {
      // POST 请求但未实现防重复提交，且成功后无轻提示
      this.$http.post('/api/submit', { data: 'test' })
        .then(res => {
          console.log('提交成功', res);
        });
    }
  }
}
</script>


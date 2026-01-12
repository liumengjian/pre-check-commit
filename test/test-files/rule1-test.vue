<template>
  <div>
    <el-button @click="handleAdd">新增</el-button>
  </div>
</template>

<script>
export default {
  methods: {
    handleAdd() {
      // 调用接口但未实现防重复提交
      this.$http.get('/api/add');
    }
  }
}
</script>


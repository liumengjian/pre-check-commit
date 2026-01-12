<template>
  <div>
    <!-- 规则4违规：非 Table 组件列表未实现空状态 -->
    <div v-for="item in list" :key="item.id">
      {{ item.name }}
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      list: []
    }
  }
}
</script>


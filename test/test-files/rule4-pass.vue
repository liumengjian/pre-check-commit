<template>
  <div>
    <!-- 规则4通过：非 Table 组件列表实现了空状态 -->
    <div v-if="list.length === 0" class="empty-state">
      暂无数据
    </div>
    <div v-else v-for="item in list" :key="item.id">
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


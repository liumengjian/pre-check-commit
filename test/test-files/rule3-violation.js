// 规则3违规：POST 接口操作成功后未触发轻提示
export async function handleAdd(data) {
  const response = await fetch('/api/add', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  
  const result = await response.json();
  // 操作成功但未触发轻提示
  console.log('新增成功', result);
}


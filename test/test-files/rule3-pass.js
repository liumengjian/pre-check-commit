import { message } from 'antd';

// 规则3通过：POST 接口操作成功后触发了轻提示
export async function handleAdd(data) {
  const response = await fetch('/api/add', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  
  const result = await response.json();
  // 操作成功并触发轻提示
  message.success('新增成功');
  return result;
}


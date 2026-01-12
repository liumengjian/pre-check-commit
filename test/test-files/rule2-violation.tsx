import React, { useEffect } from 'react';

// 规则2违规：新增列表页首次进入时调用接口但未实现 loading
export default function ListPage() {
  useEffect(() => {
    // 调用接口但未实现 loading
    fetch('/api/list')
      .then(res => res.json())
      .then(data => {
        console.log('列表数据', data);
      });
  }, []);

  return (
    <div>
      <h1>列表页</h1>
    </div>
  );
}


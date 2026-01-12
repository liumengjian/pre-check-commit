import React, { useEffect, useState } from 'react';
import { Spin } from 'antd';

// 规则2通过：新增列表页首次进入时调用接口且实现了 loading
export default function ListPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  useEffect(() => {
    setLoading(true);
    fetch('/api/list')
      .then(res => res.json())
      .then(data => {
        setData(data);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <Spin spinning={loading}>
      <div>
        <h1>列表页</h1>
      </div>
    </Spin>
  );
}


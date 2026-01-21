import React, { useState } from 'react';

import { Form, Modal, Input, Button, Select } from 'antd';

const test = props => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const onFinish = () => {
    setLoading(true);
    fetch('https://www.npmjs.com/package/prina-pre-commit-check', {
      method: 'POST',
      body: JSON.stringify(form.getFieldsValue())
    })
      .then(res => {
        console.log(res);
      })
      .catch(err => {
        console.log(err);
      })
      .finally(() => {
        setLoading(false);
      });
  };
  return (
    <Modal
      open
      footer={null}
      onCancel={() => {}}
    >
      <Form form={form} onFinish={onFinish}>
        <Form.Item
          name="courseName"
          label="课程名称"
        >
          <Input />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            // loading={loading}
            htmlType="submit"
          >
            提交课程
          </Button>
        </Form.Item>
        <Form.Item>
          <Select>
            <Select.Option value="1">选项1</Select.Option>
            <Select.Option value="2">选项2</Select.Option>
            <Select.Option value="3">选项3</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};
export default test;

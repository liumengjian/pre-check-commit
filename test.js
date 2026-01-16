import React from 'react';

import { Form, Modal, Input } from 'antd';

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
          <Input placeholder="请输入课程名称" />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            loading={loading}
            htmlType="submit"
          >
            提交
          </Button>
        </Form.Item>
        <Form.Item>
          <Select placeholder='44'>
            <Select.Option value="1">1</Select.Option>
            <Select.Option value="2">2</Select.Option>
            <Select.Option value="3">3</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};
export default test;

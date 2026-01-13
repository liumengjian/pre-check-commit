import { http } from '@cqsjjb/jjb-common-lib';
import axios from 'axios';

// 测试各种接口调用方式

// 1. declareRequest + Connect (通过 props 调用)
export default function TestComponent(props) {
  const handleSubmit = () => {
    // 应该检测到接口调用
    props.GetCourseLibraryListAction({ pageIndex: 1 });
    props.submitCourseByIdAction({ courseId: 123 });
  };
  
  const handleHttpCall = () => {
  // 2. http.Post / http.Get
    http.Post('/api/test', { data: 'test' });
    http.Get('/api/test');
  };
  
  // 3. axios
  const handleAxiosCall = () => {
    axios.post('/api/test', { data: 'test' });
    axios.get('/api/test');
    axios({
      method: 'POST',
      url: '/api/test',
      data: { test: 'data' }
    });
  };
  
  // 4. XMLHttpRequest
  const handleXHRCall = () => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/test');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ data: 'test' }));
  };
  
  // 5. props.dispatch
  const handleDispatch = () => {
    props.dispatch({
      type: 'namespace/addData',
      payload: { data: 'test' }
    });
  };
  
  // 6. fetchDataApi
  const handleFetchDataApi = (fetchDataApi) => {
    fetchDataApi({ pageIndex: 1 });
  };
  
  // 7. fetch
  const handleFetch = () => {
    fetch('/api/test', {
      method: 'POST',
      body: JSON.stringify({ data: 'test' })
    });
  };
  
  // 8. $http (Vue)
  const handleVueHttp = function() {
    this.$http.post('/api/test', { data: 'test' });
    this.$http.get('/api/test');
  };
  
  // 9. ajax (jQuery)
  const handleAjax = () => {
    $.ajax({
      url: '/api/test',
      method: 'POST',
      data: { test: 'data' }
    });
    jQuery.ajax({
      url: '/api/test',
      method: 'GET'
    });
  };
  
  return null;
}


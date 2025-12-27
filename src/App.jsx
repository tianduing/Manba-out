import React, { useState, useRef, useEffect } from 'react';
import { Loader2, Video, FileText, BrainCircuit, Layers, Play, CheckCircle2, AlertCircle } from 'lucide-react';

// --- 配置与常量 ---
const API_KEY = "AIzaSyCohfBQoOlLeFqs6WwsLFguO5F3lnbZgB8"; // 运行环境将自动填充
const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const App = () => {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, processing, completed, error
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  
  // 核心研究产出数据
  const [step1Data, setStep1Data] = useState([]); // Event Captions
  const [step2Data, setStep2Data] = useState(null); // Logical Chain
  const [step3Data, setStep3Data] = useState(null); // Final Summary

  const videoRef = useRef(null);

  // --- 辅助函数：日志记录 ---
  const addLog = (msg) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // --- 辅助函数：API 调用（指数退避） ---
  const callGemini = async (payload, endpoint = "generateContent") => {
    let delay = 1000;
    for (let i = 0; i < 5; i++) {
      try {
        const resp = await fetch(`${BASE_URL}/${MODEL_NAME}:${endpoint}?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error(`API Error: ${resp.status}`);
        return await resp.json();
      } catch (e) {
        if (i === 4) throw e;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  };

  // --- 关键步骤：提取视频帧 ---
  const captureFrames = async (file, count = 10) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.onloadedmetadata = async () => {
        const frames = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth / 2; 
        canvas.height = video.videoHeight / 2;

        const duration = video.duration;
        for (let i = 0; i < count; i++) {
          video.currentTime = (duration / count) * i;
          await new Promise(r => video.onseeked = r);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.6).split(',')[1]);
        }
        resolve(frames);
      };
    });
  };

  // --- 核心流程控制 ---
  const startSummarization = async () => {
    if (!videoFile) return;
    setStatus('processing');
    setProgress(10);
    setLogs([]);
    addLog("开始执行层次化摘要框架...");

    try {
      // --- STEP 1: 视觉语义解构 (Event-level Captioning) ---
      addLog("Step 1: 正在进行视觉语义解构 (Event-level Captioning)...");
      const frames = await captureFrames(videoFile, 12); 
      const step1Results = [];
      
      for (let i = 0; i < 3; i++) {
        const segmentFrames = frames.slice(i * 4, (i + 1) * 4);
        const payload = {
          contents: [{
            parts: [
              { text: "请详细描述这段视频片段中发生的具体事件。请包含：1. 出现了什么人或物；2. 他们正在做什么具体的动作；3. 场景或环境有什么变化。请按事实描述，不要进行艺术评价。" },
              ...segmentFrames.map(f => ({ inlineData: { mimeType: "image/jpeg", data: f } }))
            ]
          }]
        };
        const res = await callGemini(payload);
        const text = res.candidates?.[0]?.content?.parts?.[0]?.text || "提取失败";
        step1Results.push({ id: i + 1, content: text });
        setProgress(10 + (i + 1) * 20);
      }
      setStep1Data(step1Results);
      addLog("Step 1 完成：已建立视觉事实库。");

      // --- STEP 2: 逻辑链条构建 (Logical Reasoning Chain) ---
      addLog("Step 2: 正在构建逻辑推理链 (Logical Reasoning Chain)...");
      const evidenceText = step1Results.map(r => `片段 ${r.id}: ${r.content}`).join('\n\n');
      const step2Payload = {
        contents: [{
          parts: [{
            text: `请根据以下视频片段的详细描述，梳理视频的逻辑脉络：
            1. 事件起因：视频开始时处于什么状态？
            2. 发展过程：发生了哪些关键的动作连贯或变化？
            3. 因果联系：前后片段之间有什么动作上的逻辑关联？
            
            请基于事实进行梳理，不要分析拍摄手法。
            
            输入描述：
            ${evidenceText}`
          }]
        }]
      };
      const res2 = await callGemini(step2Payload);
      const logicChain = res2.candidates?.[0]?.content?.parts?.[0]?.text;
      setStep2Data(logicChain);
      setProgress(80);
      addLog("Step 2 完成：时序逻辑链已建立。");

      // --- STEP 3: 层次化聚合 (Hierarchical Synthesis) ---
      addLog("Step 3: 正在生成客观内容摘要...");
      const step3Payload = {
        contents: [{
          parts: [{
            text: `请根据以下逻辑链条，为视频写一份约200字的客观摘要。
            要求：
            1. 采用“起、承、转、合”的叙事结构，但必须描述具体的画面内容。
            2. 严禁使用“叙事功能”、“美学意义”、“前戏”、“蓄力”等抽象的艺术评论词汇。
            3. 重点描述：人物做了什么？环境变成了什么样？最后结果如何？
            4. 每一句话都必须能在逻辑链条中找到对应的事实依据。
            
            逻辑链条依据：
            ${logicChain}`
          }]
        }]
      };
      const res3 = await callGemini(step3Payload);
      setStep3Data(res3.candidates?.[0]?.content?.parts?.[0]?.text);
      setProgress(100);
      setStatus('completed');
      addLog("摘要生成成功！");

    } catch (error) {
      console.error(error);
      addLog(`错误: ${error.message}`);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-indigo-700">
              <BrainCircuit className="w-8 h-8" />
              基于逻辑感知的层次化视频摘要框架
            </h1>
            <p className="text-slate-500 mt-1">Hierarchical Logic-Aware Video Summarization (HLVS)</p>
          </div>
          <div className="flex gap-3">
            <input 
              type="file" 
              accept="video/*" 
              onChange={(e) => {
                const file = e.target.files[0];
                if(file) {
                  setVideoFile(file);
                  setVideoUrl(URL.createObjectURL(file));
                  setStatus('idle');
                  setStep1Data([]);
                  setStep2Data(null);
                  setStep3Data(null);
                  setLogs([]);
                }
              }}
              className="hidden" 
              id="video-upload" 
            />
            <label 
              htmlFor="video-upload" 
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-all font-medium"
            >
              <Video className="w-4 h-4" /> 选择测试视频 (SumMe/MP4)
            </label>
            <button 
              onClick={startSummarization}
              disabled={!videoFile || status === 'processing'}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all font-bold shadow-lg shadow-indigo-100"
            >
              {status === 'processing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              开始生成摘要
            </button>
          </div>
        </header>

        {status === 'processing' && (
          <div className="w-full bg-slate-200 rounded-full h-2.5">
            <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><Video className="w-5 h-5 text-indigo-500"/> 视频预览</h2>
              {videoUrl ? (
                <video ref={videoRef} src={videoUrl} controls className="w-full rounded-xl border border-slate-100" />
              ) : (
                <div className="aspect-video bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 italic">
                  等待上传视频...
                </div>
              )}
            </div>

            <div className="bg-slate-900 rounded-2xl p-4 shadow-sm h-64 overflow-hidden flex flex-col">
              <h2 className="text-white font-bold mb-2 flex items-center gap-2 text-sm uppercase tracking-wider">
                <FileText className="w-4 h-4 text-emerald-400"/> 运行日志
              </h2>
              <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1 text-emerald-400 opacity-80">
                {logs.length === 0 && <span className="text-slate-600">等待任务启动...</span>}
                {logs.map((log, i) => <div key={i}>{log}</div>)}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Layers className="w-6 h-6 text-orange-500"/> 
                阶段 I: 视觉语义事实库
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {step1Data.length > 0 ? step1Data.map(item => (
                  <div key={item.id} className="p-3 bg-orange-50 border border-orange-100 rounded-xl text-sm">
                    <span className="font-bold text-orange-700 uppercase block mb-1">片段 {item.id}</span>
                    <div className="text-slate-700">{item.content}</div>
                  </div>
                )) : (
                  <div className="col-span-3 py-8 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                    等待执行描述提取...
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <BrainCircuit className="w-6 h-6 text-purple-500"/> 
                  阶段 II: 时序逻辑链
                </h2>
                {step2Data ? (
                  <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-purple-50 p-4 rounded-xl border border-purple-100">
                    {step2Data}
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                    等待逻辑推理...
                  </div>
                )}
              </div>

              <div className="bg-indigo-900 rounded-2xl p-6 shadow-xl border border-indigo-700 text-white">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400"/> 
                  阶段 III: 最终内容摘要
                </h2>
                {step3Data ? (
                  <div className="text-indigo-500 bg-white p-4 rounded-xl leading-relaxed text-sm">
                    {step3Data}
                  </div>
                ) : (
                  <div className="py-12 text-center text-indigo-400 border-2 border-dashed border-indigo-800 rounded-xl">
                    等待生成摘要...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
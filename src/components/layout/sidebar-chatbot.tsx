"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useUserContext } from "@/features/auth/context/user-context";
import { useBrand } from "@/components/providers/brand-provider";

type Message = {
  id: string;
  text: string;
  type: "bot" | "usr";
};

const INITIAL_MESSAGES: Message[] = [];

const BUBBLE_MESSAGES = [
  '👋 Need any help?',
  '🚀 Start a campaign',
  '🤖 Explore agents',
  '🤖 I\'m here!'
];

export function SidebarChatbot({ mode = "window" }: { mode?: "fab" | "window" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const pathname = usePathname();
  const { user } = useUserContext();
  const brand = useBrand();
  const brandName = brand?.companyName || "PropNex AI";

  const greetingSet = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea when chat opens so keyboard appears on mobile
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => {
        textareaRef.current?.focus();
      }, 450);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    setMounted(true);
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("open-chatbot", handleOpen);
    return () => window.removeEventListener("open-chatbot", handleOpen);
  }, []);

  // Lock body scroll when window mode is open to prevent background scrolling
  useEffect(() => {
    if (mode === "window" && isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, mode]);

  // Set personalized greeting once when user context loads
  useEffect(() => {
    if (greetingSet.current) return;
    if (messages.length === 0) {
      const name = user?.firstName || "";
      greetingSet.current = true;
      setMessages([{
        id: "1",
        type: "bot",
        text: name
          ? `Hello ${name}! 👋 I'm Task Desk, your smart assistant for the ${brandName} platform.\n\nAsk me anything about your campaigns, agents, analytics, credits, or phone numbers.`
          : `Hey there! 👋 I'm Task Desk, your smart assistant for the ${brandName} platform.\n\nAsk me anything about campaigns, agents, analytics, or your dashboard.`
      }]);
    }
  }, [user]);
  
  const [bubbleText, setBubbleText] = useState("");
  const [showBubble, setShowBubble] = useState(false);
  const bubbleIndex = useRef(0);
  
  const msgsEndRef = useRef<HTMLDivElement>(null);

  // Bubble rotation logic
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const showNextBubble = () => {
      if (isOpen) return;
      setBubbleText(BUBBLE_MESSAGES[bubbleIndex.current % BUBBLE_MESSAGES.length]);
      setShowBubble(true);
      bubbleIndex.current++;
      
      timeoutId = setTimeout(() => {
        setShowBubble(false);
      }, 3200);
    };

    let intervalId: NodeJS.Timeout | undefined;

    // Initial delay then start interval
    const initialDelay = setTimeout(() => {
      showNextBubble();
      intervalId = setInterval(showNextBubble, 7000);
    }, 2000);

    return () => {
      clearTimeout(initialDelay);
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (msgsEndRef.current) {
      msgsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, isOpen]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isTyping) return;
    
    // Add user message
    const userMsg: Message = { id: Date.now().toString(), text, type: "usr" };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputValue("");
    setIsTyping(true);
    
    try {
      const companyId = user?.companyId || null;
      const firstName = user?.firstName || "";
      
      const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token") || localStorage.getItem("token");
      
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.type === "usr" ? "user" : "model", content: m.text })),
          companyId,
          firstName,
          user,
          brandName
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const errMsg = errorData?.error || "Sorry, I encountered an error. Please try again.";
        throw new Error(errMsg);
      }

      if (!res.body) throw new Error("No readable stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      
      // Create a dummy message for streaming
      const botMsgId = Date.now().toString();
      setIsTyping(false);
      setMessages((prev) => [...prev, { id: botMsgId, text: "", type: "bot" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullResponse += decoder.decode(value, { stream: true });
        
        setMessages((prev) => prev.map(m => m.id === botMsgId ? { ...m, text: fullResponse } : m));
      }
    } catch (error: any) {
      console.error(error);
      setMessages((prev) => {
        const arr = [...prev];
        const last = arr[arr.length - 1];
        if (last && last.type === "bot" && last.text === "") {
          last.text = `Error: ${error.message}`;
          return [...arr];
        }
        return [...prev, { id: Date.now().toString(), text: `Error: ${error.message}`, type: "bot" }];
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTagClick = (tag: string) => {
    setInputValue(tag);
    // Focus the input to let the user see it or just send it immediately
    setTimeout(() => {
        const sendBtn = document.getElementById("chat-send-btn");
        if (sendBtn) sendBtn.click();
    }, 50);
  };

  const getTags = () => {
    let base = ["🚀 Setup campaign", "🤖 Agent library", "📊 Analytics", "💳 Billing", "📞 Lead Reactivation", "🏢 Sub-companies"];
    
    if (pathname.includes('/billing')) {
      base = ["💳 How do I add credits?", "📊 What is my balance?", "📋 View billing history", "🏦 Minimum recharge?"];
    } else if (pathname.includes('/companies')) {
      base = ["🏢 Create a subcompany", "💰 Transfer credits", "📊 View subcompany stats", "👥 Subcompany limits"];
    } else if (pathname.includes('/campaign')) {
      base = ["🚀 Setup a new campaign", "📊 View campaign analytics", "⏸️ How to pause a campaign"];
    } else if (pathname.includes('/agents')) {
      base = ["🤖 What agents are available?", "🛠️ How do I assign an agent?", "📞 Can I listen to recordings?", "🎙️ Create custom agent"];
    } else if (pathname.includes('/settings')) {
      base = ["⚙️ How to change password?", "🔑 API Keys setup", "🔔 Notification preferences"];
    }
    
    // Ensure these major points are always accessible
    const alwaysInclude = ["📞 Lead reactivation", "💼 Major points"];
    for (const tag of alwaysInclude) {
        if (!base.some(t => t.toLowerCase() === tag.toLowerCase())) {
            base.push(tag);
        }
    }
    
    return base;
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        
        :root {
          --td-bg: #ffffff;
          --td-bg-hover: #f4f4f5;
          --td-border: rgba(0,0,0,0.1);
          --td-text: #09090b;
          --td-text-mut: #71717a;
          --td-fab: #ffffff;
          --td-fab-border: rgba(0,0,0,0.15);
          --td-ring: rgba(0,0,0,0.08);
          --td-input: #f4f4f5;
          --td-msg-bot: #f4f4f5;
          --td-msg-bot-text: #09090b;
          --td-msg-usr: #000000;
          --td-msg-usr-text: #ffffff;
          --td-tag-bg: rgba(0,0,0,0.04);
          --td-tag-hover: rgba(0,0,0,0.08);
          --td-shadow: rgba(0,0,0,0.1);
          --td-hover-border: rgba(0,0,0,0.3);
          --td-hover-shadow: 0 16px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
          --td-ring-2: rgba(0,0,0,0.04);
          --td-ring-3: rgba(0,0,0,0.02);
          --td-glow: rgba(0,0,0,0.1);
          --td-scan: rgba(0,0,0,0.2);
          --td-bubble-arrow: rgba(0,0,0,0.15);
        }
        .dark {
          --td-bg: #111113;
          --td-bg-hover: rgba(255,255,255,0.1);
          --td-border: rgba(255,255,255,0.07);
          --td-text: #f4f4f5;
          --td-text-mut: #a1a1aa;
          --td-fab: #18181b;
          --td-fab-border: rgba(255,255,255,0.13);
          --td-ring: rgba(255,255,255,0.12);
          --td-input: transparent;
          --td-msg-bot: rgba(255,255,255,0.04);
          --td-msg-bot-text: #d4d4d8;
          --td-msg-usr: #ffffff;
          --td-msg-usr-text: #000000;
          --td-tag-bg: rgba(255,255,255,0.04);
          --td-tag-hover: rgba(255,255,255,0.11);
          --td-shadow: rgba(0,0,0,0.8);
          --td-hover-border: rgba(255,255,255,0.4);
          --td-hover-shadow: 0 16px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1);
          --td-ring-2: rgba(255,255,255,0.06);
          --td-ring-3: rgba(255,255,255,0.03);
          --td-glow: rgba(255,255,255,0.35);
          --td-scan: rgba(255,255,255,0.8);
          --td-bubble-arrow: rgba(255,255,255,0.13);
        }

        /*  ROUND FAB WIDGET  */
        .fab-wrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:0;margin:auto auto 16px auto;z-index:90;}
        .fab-bubble{
          position:absolute;bottom:calc(100% + 16px);left:50%;transform:translateX(-50%) translateY(6px) scale(.92);
          background:var(--td-fab);border:1px solid var(--td-fab-border);color:var(--td-text);
          padding:8px 14px;border-radius:14px;font-size:.72rem;font-weight:500;
          white-space:nowrap;box-shadow:0 8px 24px var(--td-shadow);
          opacity:0;pointer-events:none;transition:opacity .35s,transform .35s cubic-bezier(.34,1.56,.64,1);
          z-index:99999
        }
        .fab-bubble.show{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}
        .fab-bubble::after{content:'';position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);border:6px solid transparent;border-top-color:var(--td-bubble-arrow)}
        .fab-bubble::before{content:'';position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:var(--td-fab);z-index:1}
        
        .fab{position:relative;width:56px;height:56px;cursor:pointer}
        .fab-ring{position:absolute;inset:-6px;border-radius:50%;border:1px solid var(--td-ring);animation:ring-expand 3s ease-out infinite}
        .fab-ring:nth-child(2){inset:-12px;animation-delay:.8s;border-color:var(--td-ring-2)}
        .fab-ring:nth-child(3){inset:-20px;animation-delay:1.6s;border-color:var(--td-ring-3)}
        @keyframes ring-expand{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.3)}}
        
        .fab-circle{
          width:56px;height:56px;border-radius:50%;
          background:var(--td-fab);
          border:1px solid var(--td-fab-border);
          display:flex;align-items:center;justify-content:center;
          position:relative;z-index:2;
          animation:fab-float 4s ease-in-out infinite;
          transition:transform .3s cubic-bezier(.34,1.56,.64,1),box-shadow .3s,border-color .3s;
          box-shadow:0 4px 20px var(--td-shadow);
        }
        .fab-wrap:hover .fab-circle{
          transform:scale(1.15) translateY(-4px);
          border-color:var(--td-hover-border);
          box-shadow:var(--td-hover-shadow);
        }
        @keyframes fab-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        
        .fab-glow{
          position:absolute;inset:-2px;border-radius:50%;
          background:conic-gradient(from var(--a,0deg),transparent 60%,var(--td-glow),transparent 80%);
          animation:conic-spin 4s linear infinite;
          z-index:1;
        }
        @property --a{syntax:'<angle>';initial-value:0deg;inherits:false}
        @keyframes conic-spin{to{--a:360deg}}
        .fab-glow-mask{position:absolute;inset:2px;border-radius:50%;background:var(--td-fab);z-index:1}
        
        .fab-icon{font-size:1.35rem;z-index:3;position:relative;animation:icon-pulse 3s ease-in-out infinite;}
        .fab-wrap:hover .fab-icon{animation:icon-wiggle .6s ease-in-out infinite}
        @keyframes icon-pulse{0%,100%{transform:scale(1) rotate(0deg)}25%{transform:scale(1.1) rotate(-3deg)}75%{transform:scale(1.05) rotate(3deg)}}
        @keyframes icon-wiggle{0%,100%{transform:scale(1.15) rotate(0deg)}25%{transform:scale(1.25) rotate(-15deg)}75%{transform:scale(1.25) rotate(15deg)}}
        
        .fab-scan{position:absolute;left:8px;right:8px;height:1.5px;background:linear-gradient(90deg,transparent,var(--td-scan),transparent);border-radius:2px;animation:fab-scan 2.5s ease-in-out infinite;z-index:4}
        @keyframes fab-scan{0%{top:10px;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:44px;opacity:0}}
        
        .fab-hand{position:absolute;bottom:-2px;right:-2px;font-size:16px;transform-origin:70% 80%;animation:hand 2.2s ease-in-out infinite;z-index:5;filter:drop-shadow(0 2px 5px rgba(0,0,0,.6))}
        @keyframes hand{0%,50%,100%{transform:rotate(0) scale(1)}8%{transform:rotate(28deg) scale(1.25)}16%{transform:rotate(-14deg) scale(1.15)}24%{transform:rotate(24deg) scale(1.2)}32%{transform:rotate(-10deg) scale(1.12)}40%{transform:rotate(18deg) scale(1.1)}}
        
        .fab-label{font-size:.68rem;font-weight:500;color:var(--td-text-mut);letter-spacing:.3px;margin-top:8px;display:flex;align-items:center;gap:4px}
        .fab-dot{width:5px;height:5px;background:#4ade80;border-radius:50%;animation:dot-blink 2s ease-in-out infinite}
        @keyframes dot-blink{0%,100%{opacity:1}50%{opacity:.3}}
        
        /*  BACKDROP  */
        .chat-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);z-index:99998;opacity:0;pointer-events:none;transition:opacity .4s}
        .chat-backdrop.show{opacity:1;pointer-events:auto}
        
        /*  CHAT PANEL — Desktop  */
        .chat-window{
          position:fixed;
          bottom:32px;
          left:24px;
          width:calc(100vw - 48px);
          max-width:400px;
          background:var(--td-bg);
          border:1px solid var(--td-fab-border);
          border-radius:28px;
          overflow:hidden;
          overscroll-behavior:contain;
          display:flex;flex-direction:column;
          min-height:0;
          z-index:2147483647;
          box-shadow:0 0 0 1px rgba(255,255,255,.03),0 40px 80px rgba(0,0,0,.8),0 0 60px rgba(255,255,255,.02);
          opacity:0;visibility:hidden;
          transform:translateY(20px) scale(.95);
          transform-origin:bottom left;
          transition:visibility 0s linear .45s, opacity .45s cubic-bezier(.16,1,.3,1), transform .45s cubic-bezier(.16,1,.3,1);
          height:calc(100vh - 140px);
          max-height:560px;
        }
        /* Mobile — bottom sheet, NOT full screen */
        @media (max-width: 639px) {
          .chat-window {
            left: 16px !important;
            right: 16px !important;
            bottom: 16px !important;
            top: auto !important;
            width: auto !important;
            height: calc(100svh - 100px) !important;
            max-height: 600px !important;
            max-width: none !important;
            transform-origin: bottom center;
            border-radius: 20px;
          }
          .chat-window.open {
            transform: translateY(0) scale(1);
          }
          .chat-window:not(.open) {
            transform: translateY(calc(100% + 100px)) scale(1);
          }
        }
        @media (min-width: 1024px) {
          .chat-window {
            left: calc(var(--sidebar-width, 280px) + 24px);
          }
        }
        .chat-window.open{opacity:1;visibility:visible;pointer-events:auto !important;user-select:auto !important;-webkit-user-select:auto !important;transform:translateY(0) scale(1);transition:visibility 0s linear 0s, opacity .45s cubic-bezier(.16,1,.3,1), transform .45s cubic-bezier(.16,1,.3,1);}
        
        .ch-head{
          position:relative;overflow:hidden;
          padding:20px 20px 16px;
          border-bottom:1px solid rgba(255,255,255,.07);
          flex-shrink:0;
        }
        .ch-head-bg{
          position:absolute;inset:0;
          background:
            radial-gradient(ellipse 80% 60% at 50% -10%,rgba(255,255,255,.06) 0%,transparent 70%),
            radial-gradient(ellipse at 100% 100%,rgba(255,255,255,.03) 0%,transparent 50%);
        }
        .ch-orb{
          position:absolute;width:120px;height:120px;border-radius:50%;
          background:radial-gradient(circle,rgba(255,255,255,.07) 0%,transparent 70%);
          top:-40px;right:-20px;animation:orb-drift 8s ease-in-out infinite;
        }
        @keyframes orb-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(-15px,10px)}}
        
        .ch-agent{display:flex;align-items:center;gap:14px;position:relative;z-index:1}
        .ch-av-wrap{position:relative;flex-shrink:0}
        .ch-av{
          width:48px;height:48px;border-radius:50%;
          background:var(--td-fab);
          border:1px solid var(--td-fab-border);
          display:flex;align-items:center;justify-content:center;
          font-size:1.4rem;
          animation:ch-av-float 5s ease-in-out infinite;
        }
        @keyframes ch-av-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        .ch-av-ring{position:absolute;inset:-4px;border-radius:50%;border:1px solid var(--td-ring);animation:ch-ring 3s ease-in-out infinite}
        .ch-av-ring2{position:absolute;inset:-9px;border-radius:50%;border:1px solid rgba(255,255,255,.05);animation:ch-ring 3s ease-in-out infinite 1s}
        @keyframes ch-ring{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
        
        .ch-info h3{font-size:.95rem;font-weight:700;letter-spacing:-.2px;color:var(--td-text);margin:0;}
        .ch-status{display:flex;align-items:center;gap:5px;font-size:.72rem;color:var(--td-text-mut);margin-top:3px}
        .ch-dot{width:5px;height:5px;background:#4ade80;border-radius:50%;animation:dot-blink 2s ease-in-out infinite}
        
        .ch-actions{position:absolute;top:16px;right:16px;display:flex;gap:6px;z-index:2}
        .ch-btn{width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid var(--td-border);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--td-text-mut);transition:.15s;-webkit-tap-highlight-color:transparent;}
        .ch-btn:hover,.ch-btn:active{background:rgba(255,255,255,.1);color:var(--td-text)}
        
        /* Tags row: wraps on desktop, scrolls on mobile */
        .ch-tags-row{
          width:100%;
          flex-shrink:0;
          border-bottom:1px solid rgba(255,255,255,.07);
          padding:10px 0;
        }
        .ch-tags-inner{
          display:flex;
          flex-wrap:nowrap;
          overflow-x:auto;
          overflow-y:hidden;
          -webkit-overflow-scrolling:touch;
          touch-action:pan-x;
          scrollbar-width:none;
          gap:8px;
          padding:0 16px 4px;
        }
        .ch-tags-inner::-webkit-scrollbar{display:none}
        @media (min-width:640px){
          .ch-tags-inner{
            flex-wrap:wrap;
            overflow-x:visible;
            overflow-y:visible;
          }
        }
        /* Tags row - raw tailwind used now, just keeping minimal if needed */
        .ch-tag{
          padding:7px 15px;
          border:1px solid rgba(255,255,255,.1);
          border-radius:20px;
          font-size:.73rem;
          font-weight:500;
          color:var(--td-text-mut);
          cursor:pointer;
          background:var(--td-tag-bg);
          transition:.15s;
          white-space:nowrap;
          flex-shrink:0;
          -webkit-tap-highlight-color:transparent;
          user-select:none;
        }
        .ch-tag:active{background:rgba(255,255,255,.16);color:var(--td-text);border-color:rgba(255,255,255,.25)}
        .ch-tag:hover{background:var(--td-tag-hover);color:var(--td-text);border-color:rgba(255,255,255,.2)}
        
        /* Messages area - must scroll on all devices */
        .ch-msgs{
          flex:1;
          min-height:0;
          overflow-y:auto;
          overflow-x:hidden;
          overscroll-behavior:contain;
          -webkit-overflow-scrolling:touch;
          padding:16px 16px 8px;
          display:flex;flex-direction:column;gap:12px;
          scrollbar-width:thin;
          scrollbar-color:rgba(255,255,255,.06) transparent;
          min-height:0;
        }
        .ch-msgs::-webkit-scrollbar{width:3px}
        .ch-msgs::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07);border-radius:3px}
        
        .mrow{display:flex;gap:9px;animation:min .4s cubic-bezier(.16,1,.3,1) both}
        @keyframes min{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .mrow.usr{flex-direction:row-reverse}
        .mav{width:26px;height:26px;border-radius:8px;background:var(--td-fab);border:1px solid var(--td-border);display:flex;align-items:center;justify-content:center;font-size:.8rem;flex-shrink:0;margin-top:2px;}
        .mbub{max-width:82%;padding:10px 14px;font-size:.875rem;line-height:1.55;white-space:pre-wrap;word-break:break-word;}
        .mbub.bot{background:var(--td-fab);border:1px solid var(--td-border);border-radius:16px;border-top-left-radius:4px;color:var(--td-text)}
        .mbub.usr{background:#f4f4f5;color:#09090b;font-weight:500;border-radius:16px;border-top-right-radius:4px}
        
        .type-row{display:flex;gap:9px;align-items:flex-end}
        .type-bub{background:var(--td-fab);border:1px solid var(--td-border);border-radius:16px;border-top-left-radius:4px;padding:12px 14px;display:none;gap:4px;align-items:center}
        .type-bub.show{display:flex}
        .td{width:5px;height:5px;background:#52525b;border-radius:50%;animation:tb 1.3s ease-in-out infinite}
        .td:nth-child(2){animation-delay:.18s}.td:nth-child(3){animation-delay:.36s}
        @keyframes tb{0%,60%,100%{transform:translateY(0);background:#52525b}30%{transform:translateY(-6px);background:#a1a1aa}}
        
        /* Input wrap */
        .ch-inp-wrap{
          padding:10px 14px 14px;
          border-top:1px solid rgba(255,255,255,.07);
          flex-shrink:0;
          background:var(--td-bg);
          position:relative;
          z-index:10;
        }
        @media (max-width:639px){
          .ch-inp-wrap{
            padding-bottom:max(14px, env(safe-area-inset-bottom));
          }
        }
        .ch-inp{display:flex;align-items:flex-end;gap:8px;background:var(--td-fab);border:1px solid var(--td-fab-border);border-radius:18px;padding:8px 8px 8px 16px;transition:border-color .2s,box-shadow .2s;cursor:text;}
        .ch-inp:focus-within{border-color:rgba(255,255,255,.25);box-shadow:0 0 0 3px rgba(255,255,255,.04)}
        /* 16px prevents iOS/Android zoom on focus */
        .ch-ta{flex:1;background:none;border:none;outline:none;color:var(--td-text);font-size:16px;font-family:'Inter',sans-serif;height:24px;line-height:1.5;padding:0;-webkit-appearance:none;appearance:none;-webkit-user-select:text !important;user-select:text !important;pointer-events:auto !important;}
        .ch-ta::placeholder{color:var(--td-text-mut)}
        .ch-send{width:36px;height:36px;flex-shrink:0;background:#f4f4f5;color:#09090b;border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .2s cubic-bezier(.34,1.56,.64,1),background .2s;-webkit-tap-highlight-color:transparent;}
        .ch-send:hover{transform:scale(1.1);background:#d4d4d8}
        .ch-send:active{transform:scale(.92)}
        .ch-hint{text-align:center;font-size:.62rem;color:var(--td-text-mut);margin-top:6px;letter-spacing:.2px}
      `}} />

      {mode === "fab" && (
        <div className="fab-wrap" onClick={() => { 
          window.dispatchEvent(new CustomEvent("open-chatbot"));
          setShowBubble(false);
        }}>
          <div className={cn("fab-bubble", showBubble && "show")}>
            {bubbleText}
          </div>
          <div className="fab">
            <div className="fab-ring"></div>
            <div className="fab-ring"></div>
            <div className="fab-ring"></div>
            <div className="fab-circle">
              <div className="fab-glow"></div>
              <div className="fab-glow-mask"></div>
              <div className="fab-scan"></div>
              <span className="fab-icon">🤖</span>
            </div>
            <span className="fab-hand">👋</span>
          </div>
          <div className="fab-label"><div className="fab-dot"></div>Task Desk</div>
        </div>
      )}

      {mode === "window" && mounted && (
        <>
          {/* BACKDROP */}
          <div 
            className={cn("chat-backdrop", isOpen && "show")} 
            onPointerDown={() => setIsOpen(false)}
          ></div>

          {/* CHAT PANEL */}
          <div className={cn("chat-window", isOpen && "open")}>
            <div className="ch-head">
              <div className="ch-head-bg"></div>
              <div className="ch-orb"></div>
              <div className="ch-actions">
                <div className="ch-btn" onClick={() => setIsOpen(false)}>
                  <X className="size-[13px] text-zinc-400" />
                </div>
              </div>
              <div className="ch-agent">
                <div className="ch-av-wrap">
                  <div className="ch-av-ring2"></div>
                  <div className="ch-av-ring"></div>
                  <div className="ch-av">🤖</div>
                </div>
                <div className="ch-info">
                  <h3>Task Desk</h3>
                  <div className="ch-status"><div className="ch-dot"></div>Online & active</div>
                </div>
              </div>
            </div>
            {/* Tags row — wraps on desktop, scrolls on mobile */}
            {messages.length <= 1 && (
              <div className="ch-tags-row">
                <div className="ch-tags-inner">
                  {getTags().map(tag => (
                    <div key={tag} className="ch-tag" onClick={() => handleTagClick(tag)}>{tag}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="ch-msgs">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("mrow", msg.type)}>
                  {msg.type === "bot" && <div className="mav">🤖</div>}
                  <div className={cn("mbub", msg.type)}>{msg.text.replace(/\*\*/g, '')}</div>
                </div>
              ))}
              
              <div className="type-row">
                <div className="mav" style={{ opacity: isTyping ? 1 : 0, transition: 'opacity 0.2s' }}>🤖</div>
                <div className={cn("type-bub", isTyping && "show")}>
                  <div className="td"></div><div className="td"></div><div className="td"></div>
                </div>
              </div>
              <div ref={msgsEndRef} />
            </div>

            <div className="ch-inp-wrap">
              <form className="ch-inp" onClick={() => (textareaRef.current as any)?.focus()} onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
                <input
                  type="text"
                  ref={textareaRef as any}
                  className="ch-ta"
                  placeholder="Message Task Desk..."
                  value={inputValue}
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="sentences"
                  enterKeyHint="send"
                  onChange={(e) => setInputValue(e.target.value)}
                />
                <button type="submit" id="chat-send-btn" className="ch-send" disabled={isTyping || !inputValue.trim()}>
                  <Send className="size-3.5 text-zinc-900" />
                </button>
              </form>
              <div className="ch-hint">Task Desk · Online &amp; active</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Users, Share2, LogOut, Wallet, UserPlus, FileText, ChevronRight, X, MessageSquareQuote, Check, Trophy, Settings, MoreHorizontal, Camera, History, Bell, Moon, Edit3, Image as ImageIcon, Upload, ArrowRight, Trash2, ChevronLeft, HelpCircle, Info, AlertCircle, Volume2, Search, CircleDollarSign, Calendar } from 'lucide-react';
import { Player, Round, RoomState, AppView, Transaction } from './types';
import { Avatar } from './components/Avatar';
import { Button } from './components/Button';

// --- MOCK DATA GENERATORS ---
const MOCK_NAMES = ["快乐小狗", "熬夜冠军", "打牌高手", "雀神", "养生达人", "暴富", "锦鲤", "风清扬", "扫地僧"];
const PRESET_AVATARS = [
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Sunny&backgroundColor=ffdfbf",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Zack",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Trouble",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Bandit",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Ginger",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Midnight",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo&backgroundColor=c0aede",
];

const generateUser = (isHost: boolean = false): Player => {
  if (isHost) {
    return {
      id: "host_user",
      name: "Tony",
      avatarUrl: PRESET_AVATARS[0], 
      isHost: true,
      totalScore: 0
    };
  }
  
  return {
    id: Math.random().toString(36).substr(2, 9),
    name: MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)],
    avatarUrl: PRESET_AVATARS[Math.floor(Math.random() * PRESET_AVATARS.length)],
    isHost: false,
    totalScore: 0
  };
};

export default function App() {
  // --- STATE ---
  const [view, setView] = useState<AppView>(AppView.HOME);
  
  // Initialize user from localStorage if available
  const [currentUser, setCurrentUser] = useState<Player>(() => {
    const saved = localStorage.getItem('hdpj_user_profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          id: "host_user",
          name: parsed.name,
          avatarUrl: parsed.avatarUrl,
          isHost: true,
          totalScore: 0
        };
      } catch (e) {
        console.error("Failed to parse saved profile", e);
      }
    }
    return generateUser(true);
  });

  const [room, setRoom] = useState<RoomState | null>(null);
  
  // History State
  const [history, setHistory] = useState<RoomState[]>([]);
  
  // Scoring Modal State
  const [showAddScoreModal, setShowAddScoreModal] = useState(false);
  // 'quick' = Winner takes all from losers, 'manual' = enter manually
  const [scoreMode, setScoreMode] = useState<'quick' | 'manual'>('quick'); 
  
  // Quick Mode State
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [selectedLosers, setSelectedLosers] = useState<string[]>([]);
  const [quickScoreAmount, setQuickScoreAmount] = useState<string>('');

  // Manual Mode State
  const [tempScores, setTempScores] = useState<Record<string, string>>({});

  // Transfer (P2P) Mode State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Player | null>(null);
  const [transferAmount, setTransferAmount] = useState<string>('');

  // Score Detail Modal State
  const [showScoreDetailModal, setShowScoreDetailModal] = useState(false);

  // Settlement Modal State
  const [showSettlementModal, setShowSettlementModal] = useState(false);

  // Profile Edit State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [activeEditField, setActiveEditField] = useState<'avatar' | 'name' | null>(null);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // History List Modal State
  const [showHistoryListModal, setShowHistoryListModal] = useState(false);

  // Leave Confirm State
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // --- ACTIONS ---

  const createRoom = () => {
    const newRoom: RoomState = {
      roomId: Math.floor(100000 + Math.random() * 900000).toString(),
      players: [currentUser],
      rounds: [],
      createdAt: Date.now()
    };
    setRoom(newRoom);
    setView(AppView.ROOM);
  };

  const inviteFriend = () => {
    if (!room) return;
    if (room.players.length >= 8) {
      alert("房间已满");
      return;
    }
    const newFriend = generateUser(false);
    // Ensure unique name
    while (room.players.find(p => p.name === newFriend.name)) {
      newFriend.name = MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)];
    }
    setRoom(prev => prev ? ({
      ...prev,
      players: [...prev.players, newFriend]
    }) : null);
  };

  // --- PROFILE ACTIONS ---
  
  const openProfileModal = () => {
    setEditName(currentUser.name);
    setEditAvatar(currentUser.avatarUrl);
    setShowProfileModal(true);
    setActiveEditField(null);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProfileUpdate = (field: 'avatar' | 'name') => {
    if (field === 'name' && !editName.trim()) {
      alert("昵称不能为空");
      return;
    }

    const updatedUser = { ...currentUser, name: editName, avatarUrl: editAvatar };
    setCurrentUser(updatedUser);

    // Save to localStorage
    localStorage.setItem('hdpj_user_profile', JSON.stringify({
      name: updatedUser.name,
      avatarUrl: updatedUser.avatarUrl
    }));

    // If in a room, update the player in the list
    if (room) {
      setRoom(prev => {
        if (!prev) return null;
        return {
          ...prev,
          players: prev.players.map(p => p.id === currentUser.id ? updatedUser : p)
        };
      });
    }
    setActiveEditField(null);
  };

  // --- SCORE HANDLERS ---

  const handleManualScoreChange = (playerId: string, val: string) => {
    setTempScores(prev => ({ ...prev, [playerId]: val }));
  };

  const toggleLoser = (playerId: string) => {
    setSelectedLosers(prev => 
      prev.includes(playerId) 
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const selectWinner = (playerId: string) => {
    setSelectedWinner(playerId);
    // Remove winner from losers if present
    setSelectedLosers(prev => prev.filter(id => id !== playerId));
  };

  const submitRound = () => {
    if (!room) return;
    
    let numericScores: Record<string, number> = {};
    let isValid = true;

    if (scoreMode === 'quick') {
      if (!selectedWinner || selectedLosers.length === 0 || !quickScoreAmount) {
        alert("请选择赢家、输家并输入分数");
        return;
      }
      const scorePerPerson = parseInt(quickScoreAmount, 10);
      if (isNaN(scorePerPerson) || scorePerPerson <= 0) {
        alert("请输入有效的分数");
        return;
      }

      // Logic: A (Winner) gives B (Loser) 10 points -> A records +10, B records -10
      const totalWin = scorePerPerson * selectedLosers.length;
      
      // Initialize all to 0
      room.players.forEach(p => numericScores[p.id] = 0);
      
      numericScores[selectedWinner] = totalWin;
      selectedLosers.forEach(loserId => {
        numericScores[loserId] = -scorePerPerson;
      });

    } else {
      // Manual Mode
      let roundTotal = 0;
      for (const p of room.players) {
        const val = parseInt(tempScores[p.id] || "0", 10);
        if (isNaN(val)) {
          alert("请输入有效的数字");
          isValid = false;
          break;
        }
        numericScores[p.id] = val;
        roundTotal += val;
      }
      if (!isValid) return;

      if (roundTotal !== 0) {
        const confirm = window.confirm(`本局总分为 ${roundTotal} (不为0)。确定要提交吗？`);
        if (!confirm) return;
      }
    }

    const newRound: Round = {
      id: room.rounds.length + 1,
      scores: numericScores,
      timestamp: Date.now()
    };

    // Update room state
    setRoom(prev => {
      if (!prev) return null;
      const updatedPlayers = prev.players.map(p => ({
        ...p,
        totalScore: p.totalScore + (numericScores[p.id] || 0)
      }));
      return {
        ...prev,
        rounds: [newRound, ...prev.rounds], 
        players: updatedPlayers
      };
    });

    // Reset Form
    setTempScores({});
    setSelectedWinner(null);
    setSelectedLosers([]);
    setQuickScoreAmount('');
    setShowAddScoreModal(false);
  };

  const handlePlayerClick = (p: Player) => {
    if (p.id === currentUser.id) return; // Prevent clicking self
    setTransferTarget(p);
    setTransferAmount('');
    setShowTransferModal(true);
  };

  const submitTransfer = () => {
    if (!room || !transferTarget || !transferAmount) return;
    const amount = parseInt(transferAmount, 10);
    
    // Strict positive check
    if (isNaN(amount) || amount <= 0) {
      alert("请输入有效的正数积分");
      return;
    }

    // Logic: Current User gives 'amount' to Target.
    // Current User Score decreases (Sender pays)
    // Target Score increases (Receiver gets)
    
    const numericScores: Record<string, number> = {};
    room.players.forEach(p => numericScores[p.id] = 0);
    
    numericScores[currentUser.id] = -amount;
    numericScores[transferTarget.id] = amount;

    const newRound: Round = {
      id: room.rounds.length + 1,
      scores: numericScores,
      timestamp: Date.now()
    };

    setRoom(prev => {
      if (!prev) return null;
      const updatedPlayers = prev.players.map(p => ({
        ...p,
        totalScore: p.totalScore + (numericScores[p.id] || 0)
      }));
      return {
        ...prev,
        rounds: [newRound, ...prev.rounds],
        players: updatedPlayers
      };
    });

    setShowTransferModal(false);
    setTransferTarget(null);
    setTransferAmount('');
  };

  const handleLeaveClick = () => {
    setShowLeaveConfirm(true);
  };

  const confirmLeave = () => {
    if (room && room.rounds.length > 0) {
      // Save to history if there was activity
      setHistory(prev => [room, ...prev]);
    }
    
    // Completely clear room and return home
    setRoom(null);
    setView(AppView.HOME);
    setShowSettlementModal(false);
    setShowLeaveConfirm(false);
  };

  const cancelLeave = () => {
    setShowLeaveConfirm(false);
  };

  const settleGame = () => {
    if (!room) return;
    if (room.rounds.length === 0) {
      alert("还没有进行任何对局，无法结算。");
      return;
    }
    setShowSettlementModal(true);
  };

  // --- HELPERS ---

  const calculateTransfers = (): Transaction[] => {
    if (!room) return [];
    let balances = room.players.map(p => ({ 
      id: p.id, 
      name: p.name, 
      balance: p.totalScore 
    }));
    
    const transactions: Transaction[] = [];
    let debtors = balances.filter(b => b.balance < 0).sort((a, b) => a.balance - b.balance);
    let creditors = balances.filter(b => b.balance > 0).sort((a, b) => b.balance - a.balance);

    let i = 0; 
    let j = 0; 

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
      
      transactions.push({
        fromName: debtor.name,
        toName: creditor.name,
        amount: amount
      });

      debtor.balance += amount;
      creditor.balance -= amount;

      if (Math.abs(debtor.balance) < 0.01) i++;
      if (creditor.balance < 0.01) j++;
    }
    return transactions;
  };

  const getScoreEvents = () => {
    if (!room) return [];
    return room.rounds.flatMap(round => 
      Object.entries(round.scores)
        .filter(([, score]) => score !== 0)
        .map(([playerId, score]) => ({
          uniqueId: `${round.id}-${playerId}`,
          playerId,
          score,
          timestamp: round.timestamp
        }))
    ).sort((a, b) => b.timestamp - a.timestamp);
  };

  const getTotalRoundsPlayed = () => {
    const historyRounds = history.reduce((acc, r) => acc + r.rounds.length, 0);
    const currentRounds = room ? room.rounds.length : 0;
    return historyRounds + currentRounds;
  };

  // --- COMMON UI COMPONENTS ---
  
  const profileModalElement = (
    <div className="fixed inset-0 z-50 bg-[#f6f7f9] animate-in slide-in-from-right duration-200 overflow-y-auto">
       {/* Custom Nav */}
       <div className="sticky top-0 z-10 px-4 pt-12 pb-2 flex justify-between items-center bg-gradient-to-b from-[#dae4ff] to-[#eef2ff]">
          <button onClick={() => setShowProfileModal(false)}><ChevronLeft size={24} className="text-gray-900" /></button>
          <div className="flex items-center gap-2">
             <div className="bg-white/50 p-1.5 rounded-full"><MoreHorizontal size={20} className="text-gray-900"/></div>
             <div className="bg-white/50 p-1.5 rounded-full"><div className="w-5 h-5 rounded-full border-2 border-gray-900"></div></div>
          </div>
       </div>

       {/* Hero Section */}
       <div className="bg-gradient-to-b from-[#eef2ff] to-[#f6f7f9] flex flex-col items-center pt-2 pb-8">
          <div className="relative mb-4">
            <Avatar url={currentUser.avatarUrl} alt={currentUser.name} size="xl" className="w-24 h-24 border-4 border-white shadow-sm" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-8">{currentUser.name}</h2>
          
          <div className="flex items-center w-full max-w-xs justify-between px-8">
             <div className="flex flex-col items-center gap-1">
                <div className="text-xl font-bold text-gray-900">{getTotalRoundsPlayed()}</div>
                <div className="text-xs text-gray-400 flex items-center gap-1">累计局数 <History size={10}/></div>
             </div>
             <div className="w-px h-8 bg-gray-200"></div>
             <button onClick={() => setShowHistoryListModal(true)} className="flex flex-col items-center gap-1 group">
                <div className="text-xl font-bold text-gray-900 group-hover:text-[#4c88ff] transition-colors">{history.length}</div>
                <div className="text-xs text-gray-400 flex items-center gap-1">历史场次 <ChevronRight size={10}/></div>
             </button>
          </div>
       </div>

       {/* List Groups */}
       <div className="px-4 space-y-4 -mt-4 pb-20">
          {/* Group 1 */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
             <button 
               onClick={() => setActiveEditField('avatar')}
               className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b border-gray-50"
             >
                <div className="flex items-center gap-3">
                   <div className="p-1"><ImageIcon size={20} className="text-gray-900" /></div>
                   <span className="font-bold text-gray-900">头像</span>
                </div>
                <div className="flex items-center gap-2">
                   <Avatar url={currentUser.avatarUrl} alt="Small" size="xs" />
                   <ChevronRight size={16} className="text-gray-300" />
                </div>
             </button>
             <button 
               onClick={() => {
                  setEditName(currentUser.name);
                  setActiveEditField('name');
               }}
               className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
             >
                <div className="flex items-center gap-3">
                   <div className="p-1"><UserPlus size={20} className="text-gray-900" /></div>
                   <span className="font-bold text-gray-900">昵称</span>
                </div>
                <div className="flex items-center gap-2">
                   <span className="text-gray-500 text-sm">{currentUser.name}</span>
                   <ChevronRight size={16} className="text-gray-300" />
                </div>
             </button>
          </div>

          {/* Group 2 */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
             <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b border-gray-50">
                <div className="flex items-center gap-3">
                   <div className="p-1"><Info size={20} className="text-gray-700" /></div>
                   <span className="font-bold text-gray-900">关于我们</span>
                </div>
                <ChevronRight size={16} className="text-gray-300" />
             </button>
             <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                   <div className="p-1"><AlertCircle size={20} className="text-gray-700" /></div>
                   <span className="font-bold text-gray-900">免责声明</span>
                </div>
                <ChevronRight size={16} className="text-gray-300" />
             </button>
          </div>

          {/* Footer Logo */}
          <div className="pt-8 pb-4 flex flex-col items-center gap-2">
             <div className="flex items-center gap-1.5 text-[#4c88ff] font-bold text-lg">
                <span className="bg-[#4c88ff] text-white p-0.5 rounded text-xs">♠</span>
                欢乐打牌记
             </div>
             <div className="text-xs text-gray-400">版本号 v1.0</div>
          </div>
       </div>

       {/* Sub-Modal: Edit Name */}
       {activeEditField === 'name' && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[1px] px-6">
             <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-xl animate-in zoom-in-95">
                <h3 className="text-lg font-bold mb-4">修改昵称</h3>
                <input 
                   type="text" 
                   value={editName}
                   onChange={(e) => setEditName(e.target.value)}
                   maxLength={12}
                   className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-[#4c88ff] mb-4"
                   placeholder="请输入昵称"
                   autoFocus
                 />
                 <div className="flex gap-3">
                    <Button variant="secondary" fullWidth size="sm" onClick={() => setActiveEditField(null)}>取消</Button>
                    <Button fullWidth size="sm" onClick={() => saveProfileUpdate('name')}>保存</Button>
                 </div>
             </div>
          </div>
       )}

       {/* Sub-Modal: Edit Avatar */}
       {activeEditField === 'avatar' && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[1px] px-6">
             <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-xl animate-in zoom-in-95">
                <h3 className="text-lg font-bold mb-4">修改头像</h3>
                <div className="flex flex-col items-center mb-6">
                   <div className="relative mb-4 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                      <Avatar url={editAvatar} alt="Current" size="xl" className="border-2 border-gray-100" />
                      <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center text-white">
                         <Upload size={24} />
                      </div>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*"
                        onChange={handleFileUpload}
                      />
                   </div>
                   <p className="text-xs text-gray-400 mb-3">点击上传或选择下方预设</p>
                   <div className="flex flex-wrap gap-2 justify-center">
                     {PRESET_AVATARS.slice(0, 5).map((url, i) => (
                       <button key={i} onClick={() => setEditAvatar(url)} className={`rounded-full p-0.5 border-2 ${editAvatar === url ? 'border-[#4c88ff]' : 'border-transparent'}`}>
                         <Avatar url={url} alt={`Preset ${i}`} size="sm" />
                       </button>
                     ))}
                   </div>
                 </div>
                 <div className="flex gap-3">
                    <Button variant="secondary" fullWidth size="sm" onClick={() => {
                       setEditAvatar(currentUser.avatarUrl); // Reset
                       setActiveEditField(null);
                    }}>取消</Button>
                    <Button fullWidth size="sm" onClick={() => saveProfileUpdate('avatar')}>保存</Button>
                 </div>
             </div>
          </div>
       )}

       {/* Sub-Modal: History List */}
       {showHistoryListModal && (
          <div className="fixed inset-0 z-[60] bg-[#f6f7f9] animate-in slide-in-from-right duration-200 overflow-y-auto">
             <div className="sticky top-0 z-10 px-4 py-4 flex items-center bg-white shadow-sm">
                <button onClick={() => setShowHistoryListModal(false)}><ChevronLeft size={24} className="text-gray-900" /></button>
                <span className="font-bold text-lg ml-4">历史战绩</span>
             </div>
             
             <div className="p-4 space-y-3">
               {history.length === 0 ? (
                 <div className="text-center text-gray-400 mt-20">
                   <div className="inline-block p-4 bg-gray-100 rounded-full mb-3"><History size={32} /></div>
                   <p>暂无历史对局</p>
                 </div>
               ) : (
                 history.map((histRoom, index) => (
                   <div key={index} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                     <div className="flex justify-between items-center mb-3">
                       <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(histRoom.createdAt).toLocaleDateString()} {new Date(histRoom.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                       </span>
                       <span className="text-xs bg-blue-50 text-[#4c88ff] px-2 py-0.5 rounded-full font-medium">
                         {histRoom.rounds.length} 局
                       </span>
                     </div>
                     <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                       {histRoom.players.map((p) => (
                         <div key={p.id} className="relative flex-shrink-0 flex flex-col items-center w-12">
                           <Avatar url={p.avatarUrl} alt={p.name} size="sm" className="w-10 h-10 border border-gray-100" />
                           <span className="text-[10px] text-gray-500 mt-1 truncate w-full text-center">{p.name}</span>
                           <span className={`text-[10px] font-bold ${p.totalScore >= 0 ? 'text-[#fa9d3b]' : 'text-[#07c160]'}`}>
                             {p.totalScore > 0 ? '+' : ''}{p.totalScore}
                           </span>
                         </div>
                       ))}
                     </div>
                   </div>
                 ))
               )}
             </div>
          </div>
       )}
    </div>
  );

  // --- VIEWS ---

  if (view === AppView.HOME) {
    return (
      <div className="min-h-screen bg-[#f6f7f9] flex flex-col relative">
        <div className="flex-1 flex flex-col items-center pt-24 px-6">
          {/* User Profile */}
          <div className="relative mb-4 cursor-pointer group" onClick={openProfileModal}>
             <Avatar url={currentUser.avatarUrl} alt={currentUser.name} size="xl" className="border-4 border-white shadow-sm" />
             <div className="absolute bottom-0 right-0 bg-white rounded-full p-1.5 shadow border border-gray-100 group-hover:bg-blue-50 transition-colors">
               <Edit3 size={12} className="text-gray-600 group-hover:text-[#4c88ff]" />
             </div>
          </div>
          
          <div className="flex items-center gap-2 mb-8 cursor-pointer p-2 rounded-lg hover:bg-gray-100 transition-colors" onClick={openProfileModal}>
            <h1 className="text-2xl font-bold text-gray-900">{currentUser.name}</h1>
            <Edit3 size={16} className="text-gray-400" />
          </div>
          
          <div className="text-gray-400 text-sm mb-20">点击头像或昵称可修改信息</div>

          <Button 
            onClick={createRoom} 
            fullWidth 
            size="lg" 
            className="rounded-xl shadow-blue-500/20 mb-8 max-w-xs"
          >
            创建房间
          </Button>

          <div className="text-gray-500 text-sm border-b border-gray-400 pb-0.5 inline-block">使用说明</div>
        </div>

        {/* Footer */}
        <div className="pb-10 flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 text-[#4c88ff] font-bold text-lg">
            <span className="bg-[#4c88ff] text-white p-0.5 rounded text-xs">♠</span>
            欢乐打牌记
          </div>
          <div className="text-[10px] text-gray-400 max-w-[200px] leading-tight">
            本程序仅供娱乐，请勿用于非法活动<br/>
            远离赌博，快乐生活
          </div>
          <div className="text-[10px] text-gray-300 mt-1">版本号 v1.0</div>
        </div>

        {/* Profile Edit Modal */}
        {showProfileModal && profileModalElement}
      </div>
    );
  }

  // View: ROOM
  const myPlayer = room?.players.find(p => p.id === currentUser.id);
  
  return (
    <div className="min-h-screen bg-[#f6f7f9] flex flex-col">
      {/* Top Header */}
      <header className="bg-gradient-to-b from-[#eef2ff] to-[#f6f7f9] px-4 pt-2 pb-4">
        <div className="flex items-center justify-between mb-6">
           <div className="flex items-center gap-1.5 text-[#4c88ff] font-bold text-lg">
              <span className="bg-[#4c88ff] text-white px-1 rounded text-sm">♠</span>
              欢乐打牌记
           </div>
        </div>
        
        <div className="flex items-center gap-3 mb-6">
          <Avatar url={currentUser.avatarUrl} alt={currentUser.name} size="md" className="border-2 border-white shadow-sm" />
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-gray-900">{currentUser.name}</h2>
            <p className="text-xs text-gray-400">欢迎使用，祝你玩的开心~</p>
          </div>
          <button onClick={openProfileModal} className="ml-auto text-[#4c88ff] border border-[#4c88ff] px-3 py-1 rounded-full text-xs">个人中心</button>
        </div>

        {/* My Score Card */}
        <div className="bg-gradient-to-r from-[#4c88ff] to-[#3b76f6] rounded-2xl p-6 text-white shadow-lg shadow-blue-500/20 relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
             <Trophy size={100} />
           </div>
           <div className="relative z-10">
             <div className="text-sm font-medium opacity-90 mb-1">我的积分</div>
             <div className="text-5xl font-bold font-mono tracking-tight mb-6">
               {myPlayer ? myPlayer.totalScore : 0}
             </div>
             
             <div className="flex items-center justify-between text-xs opacity-80 border-t border-white/20 pt-3">
               <div className="flex gap-4">
                 <span>我的排名: {room ? [...room.players].sort((a,b) => b.totalScore - a.totalScore).findIndex(p => p.id === currentUser.id) + 1 : 1}</span>
               </div>
               <div 
                 className="flex items-center gap-1 cursor-pointer hover:underline"
                 onClick={() => setShowScoreDetailModal(true)}
               >
                 积分明细 <ChevronRight size={12} />
               </div>
             </div>
           </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 px-4 pb-32">
        {/* Room Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">房间</h3>
          <button onClick={inviteFriend} className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#4c88ff] text-[#4c88ff] hover:bg-blue-50 transition-colors">
            <Plus size={20} />
          </button>
        </div>

        {/* Player List (Scoreboard) */}
        <div className="space-y-3 mb-24 px-1">
          {(room?.players.length || 0) === 0 ? (
             <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-sm border border-white/50">
                <div className="bg-gradient-to-br from-blue-50 to-white rounded-full p-4 mb-3 text-[#4c88ff] shadow-inner">
                  <Users size={32} />
                </div>
                <h3 className="text-gray-900 font-bold mb-1">等待玩家加入</h3>
                <p className="text-sm text-gray-400 mb-4">邀请好友加入房间开始计分</p>
                <Button onClick={inviteFriend} variant="primary" size="sm" className="shadow-lg shadow-blue-500/20 rounded-full px-8">
                   <Share2 size={16} /> 邀请好友
                </Button>
             </div>
          ) : (
            <>
               <div className="flex items-center justify-between px-2 mb-2">
                  <span className="text-xs font-bold text-gray-400">排行榜 ({room?.players.length}人)</span>
                  <span className="text-[10px] text-gray-400 flex items-center gap-1 bg-white/60 px-2 py-1 rounded-full">
                    <Info size={10} /> 点击头像可转分
                  </span>
               </div>
               
               {/* Sort players by score for the leaderboard view */}
               {[...room!.players]
                 .sort((a, b) => b.totalScore - a.totalScore)
                 .map((p, idx) => {
                   const isMe = p.id === currentUser.id;
                   const rank = idx + 1; // Since we are mapping the sorted array
                   const isTop1 = rank === 1;
                   const isTop2 = rank === 2;
                   const isTop3 = rank === 3;
                   
                   return (
                     <div 
                       key={p.id} 
                       onClick={() => handlePlayerClick(p)}
                       style={{ animationDelay: `${idx * 100}ms` }}
                       className={`
                         relative group overflow-hidden rounded-2xl p-4 flex items-center justify-between transition-all duration-300
                         animate-in slide-in-from-bottom-4 fade-in fill-mode-backwards
                         ${isMe 
                           ? 'bg-gradient-to-r from-blue-50/80 to-white border border-blue-100 shadow-md shadow-blue-100/50' 
                           : 'bg-white border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]'
                         }
                       `}
                     >
                        {/* Background Decor for Leader */}
                        {isTop1 && <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-yellow-100/40 to-transparent rounded-full blur-xl pointer-events-none"></div>}
                        
                        <div className="flex items-center gap-4 relative z-10">
                           {/* Rank Badge */}
                           <div className="flex-shrink-0 w-6 flex justify-center font-bold text-lg" style={{ fontVariantNumeric: 'tabular-nums' }}>
                             {isTop1 ? '🥇' :
                              isTop2 ? '🥈' :
                              isTop3 ? '🥉' :
                              <span className="text-gray-300 text-sm font-mono mt-1">{rank}</span>
                             }
                           </div>

                           <div className="relative">
                             <Avatar url={p.avatarUrl} alt={p.name} size="md" className={`border-2 ${isTop1 ? 'border-yellow-400' : isMe ? 'border-blue-200' : 'border-transparent'}`} />
                             {p.isHost && <div className="absolute -bottom-1 -right-1 bg-gray-900 text-white text-[9px] px-1.5 py-0.5 rounded-full border border-white leading-none shadow-sm">房主</div>}
                           </div>
                           
                           <div className="flex flex-col">
                             <span className={`font-bold text-base flex items-center gap-1 ${isMe ? 'text-[#4c88ff]' : 'text-gray-800'}`}>
                               {p.name} 
                               {isMe && <span className="text-[9px] font-normal text-white bg-[#4c88ff] px-1.5 py-0.5 rounded-full">我</span>}
                             </span>
                             {isTop1 && <span className="text-[10px] text-yellow-600 bg-yellow-50 px-1.5 rounded-md w-fit">当前第一</span>}
                           </div>
                        </div>

                        <div className="relative z-10 text-right">
                           <span className={`font-mono font-black text-2xl tracking-tight block ${
                             p.totalScore > 0 ? 'text-[#fa9d3b]' : 
                             p.totalScore < 0 ? 'text-[#07c160]' : 'text-gray-300'
                           }`}>
                             {p.totalScore > 0 ? '+' : ''}{p.totalScore}
                           </span>
                           <span className="text-[10px] text-gray-300 font-medium">分</span>
                        </div>
                     </div>
                   );
               })}
            </>
          )}
        </div>
      </div>

      {/* Floating Record Button */}
      <div className="fixed bottom-24 left-0 right-0 px-6 flex justify-center pointer-events-none z-20">
         <button 
           onClick={() => setShowAddScoreModal(true)}
           disabled={(room?.players.length || 0) < 2}
           className="pointer-events-auto bg-[#4c88ff] hover:bg-[#3b76f6] text-white w-14 h-14 rounded-full shadow-xl shadow-blue-500/40 flex items-center justify-center transition-transform active:scale-90 disabled:opacity-50 disabled:grayscale"
         >
            <Plus size={28} />
         </button>
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)] z-30">
         <div className="grid grid-cols-2">
            <button onClick={handleLeaveClick} className="h-16 flex items-center justify-center gap-2 bg-[#1a1a1a] text-white hover:bg-black transition-colors text-base font-medium relative">
              离开房间
            </button>
            <button onClick={settleGame} className="h-16 flex items-center justify-center gap-2 bg-[#4c88ff] text-white hover:bg-[#3b76f6] transition-colors text-base font-medium">
              结算积分
            </button>
         </div>
      </div>

      {/* Leave Room Action Sheet */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 transition-opacity" 
            onClick={cancelLeave}
          />
          
          {/* Sheet Content */}
          <div className="relative z-10 w-full bg-[#f7f7f7] rounded-t-xl overflow-hidden pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-300">
             {/* Confirm Button */}
             <div className="bg-white">
                <button 
                  onClick={confirmLeave}
                  className="w-full h-14 text-center text-[17px] text-[#fa5151] flex items-center justify-center border-b border-gray-100 active:bg-gray-50"
                >
                  确认
                </button>
             </div>
             
             {/* Cancel Button (Gap above) */}
             <div className="mt-2 bg-white">
                <button 
                  onClick={cancelLeave}
                  className="w-full h-14 text-center text-[17px] text-gray-900 flex items-center justify-center active:bg-gray-50"
                >
                  取消
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Profile Edit Modal in Room View */}
      {showProfileModal && profileModalElement}

      {/* Transfer (P2P) Modal */}
      {showTransferModal && transferTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200 px-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-gray-900">积分划转</h3>
               <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
             </div>

             <div className="flex items-center justify-between mb-8 px-4">
               <div className="flex flex-col items-center gap-2">
                 <Avatar url={currentUser.avatarUrl} alt="Me" size="lg" />
                 <span className="text-xs font-bold text-gray-600">我</span>
               </div>
               
               <div className="flex flex-col items-center">
                 <div className="flex items-center gap-2 text-gray-300 mb-1">
                   <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                   <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                   <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                   <ArrowRight size={20} className="text-gray-400" />
                 </div>
                 <span className="text-[10px] text-gray-400">支付给</span>
               </div>

               <div className="flex flex-col items-center gap-2">
                 <Avatar url={transferTarget.avatarUrl} alt="Target" size="lg" />
                 <span className="text-xs font-bold text-gray-600">{transferTarget.name}</span>
               </div>
             </div>

             <div className="mb-6">
               <label className="block text-xs font-bold text-gray-400 mb-2 text-center">输入积分数量 (正整数)</label>
               <div className="relative">
                 <input 
                   type="number" 
                   inputMode="numeric"
                   pattern="[0-9]*"
                   min="1"
                   value={transferAmount}
                   onChange={(e) => setTransferAmount(e.target.value)}
                   className="w-full text-center text-4xl font-bold font-mono py-4 border-b-2 border-gray-100 focus:border-[#4c88ff] outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                   placeholder="0"
                   autoFocus
                 />
               </div>
               <p className="text-[10px] text-gray-400 text-center mt-2">
                 确认后：您的积分 <span className="text-red-500 font-bold">-{transferAmount || '0'}</span>，
                 对方积分 <span className="text-green-500 font-bold">+{transferAmount || '0'}</span>
               </p>
             </div>

             <Button onClick={submitTransfer} fullWidth size="lg" className="rounded-xl shadow-lg shadow-blue-500/20">
               确认划转
             </Button>
          </div>
        </div>
      )}

      {/* Score Detail Modal (History) */}
      {showScoreDetailModal && room && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200 px-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
               <h3 className="text-lg font-bold text-gray-900">积分明细</h3>
               <button onClick={() => setShowScoreDetailModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
            </div>
            
            <div className="overflow-y-auto flex-1 -mx-4 px-4 space-y-0">
              {getScoreEvents().length === 0 ? (
                <div className="text-center text-gray-400 py-10 flex flex-col items-center">
                   <div className="bg-gray-50 p-4 rounded-full mb-3 text-gray-300">
                     <History size={24} />
                   </div>
                   暂无对局记录
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {getScoreEvents().map((event) => {
                    const player = room.players.find(p => p.id === event.playerId);
                    if (!player) return null;
                    return (
                      <div key={event.uniqueId} className="flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors">
                         <div className="flex items-center gap-3">
                            <Avatar url={player.avatarUrl} alt={player.name} size="sm" className="w-9 h-9 border border-gray-100" />
                            <div className="flex flex-col">
                               <span className="text-sm font-bold text-gray-800">{player.name}</span>
                               <span className="text-[10px] text-gray-400">
                                 {new Date(event.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                               </span>
                            </div>
                         </div>
                         <span className={`font-mono font-bold text-lg ${event.score > 0 ? 'text-[#fa9d3b]' : 'text-[#07c160]'}`}>
                            {event.score > 0 ? '+' : ''}{event.score}
                         </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Score Modal */}
      {showAddScoreModal && room && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="bg-[#f6f7f9] w-full max-w-md sm:rounded-2xl rounded-t-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 duration-300 max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-100">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button 
                  onClick={() => setScoreMode('quick')}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${scoreMode === 'quick' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  快捷记分
                </button>
                <button 
                   onClick={() => setScoreMode('manual')}
                   className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${scoreMode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  自由输入
                </button>
              </div>
              <button onClick={() => setShowAddScoreModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1">
              
              {scoreMode === 'quick' ? (
                <div className="space-y-6">
                  {/* Winner Section */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 mb-3 ml-1 flex items-center gap-1">
                      <Trophy size={14} className="text-[#fa9d3b]" />
                      赢家 (Winner) <span className="text-gray-300 font-normal">- 收分</span>
                    </h4>
                    <div className="grid grid-cols-4 gap-3">
                      {room.players.map(p => {
                        const isWinner = selectedWinner === p.id;
                        return (
                          <button 
                            key={p.id}
                            onClick={() => selectWinner(p.id)}
                            className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${isWinner ? 'border-[#fa9d3b] bg-orange-50 scale-105 shadow-sm' : 'border-transparent bg-white shadow-sm'}`}
                          >
                            <div className="relative">
                              <Avatar url={p.avatarUrl} alt={p.name} size="md" className={isWinner ? '' : 'opacity-80 grayscale-[0.3]'} />
                              {isWinner && <div className="absolute -top-1 -right-1 bg-[#fa9d3b] text-white rounded-full p-0.5 border border-white"><Check size={10} /></div>}
                            </div>
                            <span className={`text-[10px] mt-2 truncate w-full text-center font-medium ${isWinner ? 'text-[#fa9d3b]' : 'text-gray-500'}`}>{p.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Loser Section */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 mb-3 ml-1 flex items-center gap-1">
                      <Wallet size={14} className="text-[#07c160]" />
                      输家 (Payers) <span className="text-gray-300 font-normal">- 付分</span>
                    </h4>
                    <div className="grid grid-cols-4 gap-3">
                      {room.players.map(p => {
                        if (p.id === selectedWinner) return null; 
                        const isLoser = selectedLosers.includes(p.id);
                        return (
                          <button 
                            key={p.id}
                            onClick={() => toggleLoser(p.id)}
                            className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${isLoser ? 'border-[#07c160] bg-green-50 scale-105 shadow-sm' : 'border-transparent bg-white shadow-sm'}`}
                          >
                            <div className="relative">
                              <Avatar url={p.avatarUrl} alt={p.name} size="md" className={isLoser ? '' : 'opacity-80 grayscale-[0.3]'} />
                              {isLoser && <div className="absolute -top-1 -right-1 bg-[#07c160] text-white rounded-full p-0.5 border border-white"><Check size={10} /></div>}
                            </div>
                            <span className={`text-[10px] mt-2 truncate w-full text-center font-medium ${isLoser ? 'text-[#07c160]' : 'text-gray-500'}`}>{p.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Amount Section */}
                  <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mt-2">
                    <label className="text-xs text-gray-500 font-bold mb-2 block">单家支付分数</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="0"
                        value={quickScoreAmount}
                        onChange={(e) => setQuickScoreAmount(e.target.value)}
                        className="flex-1 text-3xl font-mono font-bold text-center border-b border-gray-100 focus:border-[#4c88ff] outline-none py-2 bg-transparent text-gray-800 placeholder-gray-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        autoFocus
                      />
                      <span className="text-gray-400 font-medium">分</span>
                    </div>
                    {/* Summary Preview */}
                    {selectedWinner && selectedLosers.length > 0 && quickScoreAmount && (
                      <div className="mt-4 pt-3 border-t border-dashed border-gray-100 text-xs flex justify-between text-gray-500">
                         <span>赢家总收: <span className="text-[#fa9d3b] font-bold text-sm">+{parseInt(quickScoreAmount) * selectedLosers.length}</span></span>
                         <span>输家每人: <span className="text-[#07c160] font-bold text-sm">-{quickScoreAmount}</span></span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 mb-2">手动输入每位玩家的分数变化 (正负数)</p>
                  {room.players.map(p => (
                     <div key={p.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                       <div className="flex items-center gap-3">
                         <Avatar url={p.avatarUrl} alt={p.name} size="md" />
                         <span className="font-medium text-gray-700 w-20 truncate">{p.name}</span>
                       </div>
                       <input
                         type="number"
                         inputMode="decimal"
                         placeholder="0"
                         value={tempScores[p.id] || ''}
                         onChange={(e) => handleManualScoreChange(p.id, e.target.value)}
                         className={`w-28 text-right p-2 rounded-lg font-mono text-lg outline-none bg-gray-50 focus:bg-white focus:ring-2 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                           parseInt(tempScores[p.id]) > 0 ? 'text-[#fa9d3b] ring-orange-100' : 
                           parseInt(tempScores[p.id]) < 0 ? 'text-[#07c160] ring-green-100' : 'text-gray-900 ring-blue-50'
                         }`}
                       />
                     </div>
                  ))}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 bg-white">
               <Button onClick={submitRound} fullWidth size="lg" className="rounded-xl shadow-lg shadow-blue-500/20">确认提交</Button>
            </div>
          </div>
        </div>
      )}

      {/* Settlement Modal (New) */}
      {showSettlementModal && room && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200 px-4">
           <div className="bg-[#f6f7f9] w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
              {/* Header */}
              <header className="flex items-center justify-between mb-6">
                 <h1 className="text-lg font-bold text-gray-900">最终结算</h1>
                 <button onClick={() => setShowSettlementModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={24}/>
                 </button>
              </header>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
                {/* Logic for Settlement */}
                {(() => {
                  const transfers = calculateTransfers();
                  const rankedPlayers = [...room.players].sort((a, b) => b.totalScore - a.totalScore);
                  return (
                    <>
                      {/* Winner Banner */}
                      {rankedPlayers.length > 0 && (
                        <div className="bg-gradient-to-br from-[#4c88ff] to-[#3b76f6] p-6 rounded-2xl shadow-lg shadow-blue-500/20 text-white flex flex-col items-center text-center relative overflow-hidden">
                          <div className="relative mb-3">
                            <span className="absolute -top-6 -right-6 text-5xl opacity-50">👑</span>
                            <Avatar url={rankedPlayers[0].avatarUrl} alt="Winner" size="lg" className="border-4 border-white/30 shadow-md" />
                          </div>
                          <h2 className="font-bold text-xl">{rankedPlayers[0].name}</h2>
                          <p className="bg-white/20 px-3 py-1 rounded-full text-xs mt-2 backdrop-blur-sm">大赢家</p>
                          <div className="text-4xl font-bold mt-3 font-mono">+{rankedPlayers[0].totalScore}</div>
                        </div>
                      )}

                      {/* Transfer List */}
                      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                          <Wallet size={18} className="text-[#4c88ff]" /> 
                          输家付给赢家
                        </h3>
                        {transfers.length > 0 ? (
                          <div className="space-y-3">
                            {transfers.map((t, idx) => (
                              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="flex items-center gap-3">
                                   <div className="flex flex-col">
                                     <span className="font-bold text-gray-700">{t.fromName}</span>
                                     <span className="text-[10px] text-gray-400">支付</span>
                                   </div>
                                   <ChevronRight size={16} className="text-gray-300" />
                                   <span className="font-bold text-gray-700">{t.toName}</span>
                                </div>
                                <span className="font-mono font-bold text-xl text-[#fa9d3b]">
                                  {t.amount}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-gray-400 text-sm py-4 bg-gray-50 rounded-lg">无转账产生</div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
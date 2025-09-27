import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// @ts-ignore
const html2canvas = window.html2canvas;
// @ts-ignore
const { createClient } = window.supabase;
// @ts-ignore
const XLSX = window.XXLSX;


const supabaseUrl = 'https://exzirprgitaigupripjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4emlycHJnaXRhaWd1cHJpcGprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMjM4NjMsImV4cCI6MjA3MjY5OTg2M30.xly1dWXifjL8GHL8hTAT7fZhKQMdf8TIwZJqQs-3Ols';
const supabase = createClient(supabaseUrl, supabaseKey);
const DEFAULT_BACKGROUND_IMAGE = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='600'%3E%3Cdefs%3E%3ClinearGradient id='grad1' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:rgb(224, 242, 241);stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:rgb(178, 223, 219);stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23grad1)' /%3E%3C/svg%3E`;

/*
  LƯU Ý VỀ LƯU TRỮ ẢNH:
  Ứng dụng này sử dụng Supabase Storage để lưu trữ ảnh nền cho các bài thơ.
  Để tính năng này hoạt động, bạn cần:
  1. Vào trang quản lý dự án Supabase của bạn.
  2. Đi đến mục "Storage".
  3. Tạo một "Bucket" mới với tên là `poem-images`.
  4. Đảm bảo bucket này được thiết lập là "Public".
  5. (Tùy chọn nhưng khuyến khích) Thiết lập các chính sách (Policies) cho bucket để kiểm soát quyền tải lên.
     Ví dụ Policy cho phép INSERT công khai vào thư mục 'public':
     CREATE POLICY "Public user can upload to public folder"
     ON storage.objects FOR INSERT
     TO anon
     WITH CHECK (bucket_id = 'poem-images' AND (storage.foldername(name))[1] = 'public');
*/

const priorityCategories = [
    "CHÙM THƠ TẶNG BÁC CHỈNH HOAN NHÂN SINH NHẬT 70, 75 & 80 TUỔI ÔNG CHỈNH VÀ KỶ NIỆM NĂM NGÀY CƯỚI ÔNG BÀ CHỈNH HOAN",
    "CHÙM THƠ MỪNG CHÚ ÁNH 80 TUỔI, 50 NĂM ĐÁM CƯỚI CHÚ ÁNH THÍM NHÀN"
];
const priorityCategoriesNormalized = priorityCategories.map(c => c.toLowerCase().trim());
const otherCategoryName = 'Chủ đề khác';



const sortCategories = (categories: string[]): string[] => {
    const priority: {cat: string, index: number}[] = [];
    const normal: string[] = [];
    let other: string | null = null;
    const otherCategoryNormalized = otherCategoryName.toLowerCase();

    categories.forEach(cat => {
        if (!cat) return;
        const normCat = cat.toLowerCase().trim();
        const priorityIndex = priorityCategoriesNormalized.indexOf(normCat);

        if (priorityIndex !== -1) {
            priority.push({ cat, index: priorityIndex });
        } else if (normCat === otherCategoryNormalized) {
            other = cat;
        } else {
            normal.push(cat);
        }
    });

    priority.sort((a, b) => a.index - b.index);
    const sortedPriority = priority.map(p => p.cat);
        
    normal.sort((a, b) => a.localeCompare(b, 'vi'));

    const final = [...sortedPriority, ...normal];
    if (other) {
        final.push(other);
    }
    
    return final;
};


const createExcerpt = (html: string, length = 150): string => {
    if (!html) {
        return '';
    }
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const text = tempDiv.textContent || tempDiv.innerText || '';

    if (text.length <= length) {
        return text;
    }

    return text.substring(0, length) + '...';
};


interface Poem {
  id: number;
  poetName: string;
  submission_date: string;
  title: string;
  category: string;
  content: string;
  backgroundImage: string;
  timestamp: number;
  likes: number;
}

type View = 'submit' | 'all' | 'library' | 'fame' | 'admin' | 'admin_login';

const parseSupabaseError = (error: any): string => {
      if (!error) return "Đã có lỗi không xác định xảy ra.";
      if (error.message.includes("canceling statement due to statement timeout")) {
          return "Yêu cầu của bạn mất quá nhiều thời gian để xử lý và đã bị hủy. Điều này có thể do tệp ảnh nền quá lớn hoặc kết nối mạng chậm. Vui lòng thử lại, nếu vẫn lỗi, hãy dùng ảnh có dung lượng nhỏ hơn.";
      }
      if (error.message.includes("violates row-level security policy")) {
          return "Lỗi bảo mật: Bạn không có quyền thực hiện hành động này. Vui lòng chạy kịch bản SQL được cung cấp để cấp quyền.";
      }
      if (error.message.includes("column") && error.message.includes("does not exist")) {
           return `Lỗi cơ sở dữ liệu: Một cột cần thiết không tồn tại. Chi tiết: ${error.message}`;
      }
      return error.message;
}

const App = () => {
  const [poems, setPoems] = useState<Poem[]>([]);
  const [currentView, setCurrentView] = useState<View>('all');
  const [isAdmin, setIsAdmin] = useState(false);
  const [likingId, setLikingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Global loading state

  const [editingPoem, setEditingPoem] = useState<Poem | null>(null);
  const [selectedPoem, setSelectedPoem] = useState<Poem | null>(null);
  const [poemToShare, setPoemToShare] = useState<Poem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const fetchPoems = useCallback(async () => {
      setIsLoading(true);
      const { data, error } = await supabase
          .from('poems')
          .select('id, poetName:poet_name, submission_date, title, category, content, backgroundImage:background_image, timestamp, likes')
          .order('submission_date', { ascending: false });

      if (error) {
          alert(`Không thể tải danh sách bài thơ: ${parseSupabaseError(error)}`);
          setIsLoading(false);
          return [];
      } else if (data) {
          const formattedData = data.map(p => ({ ...p, timestamp: new Date(p.timestamp).getTime() }));
          setPoems(formattedData);
          setIsLoading(false);
          return formattedData;
      }
      setIsLoading(false);
      return [];
  }, []);

  useEffect(() => {
    fetchPoems();
  }, [fetchPoems]);


  const handleAddPoem = async (poem: Omit<Poem, 'id' | 'timestamp' | 'likes'>) => {
    setIsLoading(true);
     const submissionData = {
        poet_name: poem.poetName,
        submission_date: poem.submission_date,
        title: poem.title,
        category: poem.category,
        content: poem.content,
        background_image: poem.backgroundImage,
    };
    const { data, error } = await supabase
        .from('poems')
        .insert([submissionData])
        .select();

    if (error) {
        alert(`Đã có lỗi xảy ra khi gửi bài thơ: ${parseSupabaseError(error)}`);
    } else if (data && data.length > 0) {
        await fetchPoems();
        const addedPoem = { ...data[0], timestamp: new Date(data[0].timestamp).getTime() };
        setPoemToShare(addedPoem);
    }
    setIsLoading(false);
  };

  const handleCloseShareModal = () => {
      setPoemToShare(null);
      if (currentView === 'submit') {
        setCurrentView('all');
      }
  }

  const handleDeletePoem = async (id: number) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa bài thơ này? Hành động này không thể hoàn tác.')) {
        setIsLoading(true);

        const { error } = await supabase
            .from('poems')
            .delete()
            .eq('id', id);

        if (error) {
            alert(`Đã có lỗi xảy ra khi xóa bài thơ: ${parseSupabaseError(error)}`);
        } else {
            setPoems(currentPoems => currentPoems.filter(p => p.id !== id));
        }

        setIsLoading(false);
    }
  };
  
  const handleUpdatePoem = async (updatedPoem: Poem) => {
    setIsLoading(true);
    const { id, ...rest } = updatedPoem;

    const submissionData = {
        poet_name: rest.poetName,
        submission_date: rest.submission_date,
        title: rest.title,
        category: rest.category,
        content: rest.content,
        timestamp: new Date(rest.timestamp).toISOString(),
        background_image: rest.backgroundImage
    };
    
    const { data: returnedData, error } = await supabase
      .from('poems')
      .update(submissionData)
      .eq('id', id)
      .select('id, poetName:poet_name, submission_date, title, category, content, backgroundImage:background_image, timestamp, likes')
      .single();

    if (error) {
        alert(`Đã có lỗi xảy ra khi cập nhật bài thơ: ${parseSupabaseError(error)}`);
    } else if (returnedData) {
        const newlyUpdatedPoem = {
            ...returnedData,
            timestamp: new Date(returnedData.timestamp).getTime()
        };
        setPoems(currentPoems =>
            currentPoems.map(p => (p.id === newlyUpdatedPoem.id ? newlyUpdatedPoem : p))
        );
        setEditingPoem(null);
    }
    setIsLoading(false);
  };

  const handleAdminLoginSuccess = () => {
      setIsAdmin(true);
      setCurrentView('admin');
  }
  
  const handleAdminLogout = () => {
    setIsAdmin(false);
    setCurrentView('all');
  };

  const handleLike = async (id: number) => {
    setLikingId(id);
    try {
        const poemToUpdate = poems.find(p => p.id === id);
        if (!poemToUpdate) throw new Error("Không tìm thấy bài thơ.");

        const newLikeCount = (poemToUpdate.likes || 0) + 1;
        
        // Update local state immediately for better UX
        setPoems(currentPoems =>
            currentPoems.map(p =>
                p.id === id ? { ...p, likes: newLikeCount } : p
            )
        );

        const { error } = await supabase
            .from('poems')
            .update({ likes: newLikeCount })
            .eq('id', id);

        if (error) {
            // Revert on error
            setPoems(currentPoems =>
                currentPoems.map(p =>
                    p.id === id ? { ...p, likes: poemToUpdate.likes } : p
                )
            );
            throw error;
        }
    } catch (error: any) {
        alert(`Đã có lỗi xảy ra khi yêu thích: ${parseSupabaseError(error)}`);
    } finally {
        setLikingId(null);
    }
  };

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    poems.forEach(poem => {
        if(poem.submission_date) {
            const date = new Date(poem.submission_date);
            yearSet.add(date.getFullYear());
        }
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [poems]);
  
  const uniqueCategories = useMemo(() => {
    const activeCategories = new Set<string>();
    let hasUncategorized = false;

    poems.forEach(poem => {
        const trimmedCategory = poem.category?.trim();
        if (trimmedCategory) {
            activeCategories.add(trimmedCategory);
        } else {
            hasUncategorized = true;
        }
    });

    if (hasUncategorized) {
        activeCategories.add(otherCategoryName);
    }
    
    return sortCategories(Array.from(activeCategories));
  }, [poems]);
  
  const filteredPoems = poems.filter(poem => {
    const searchMatch = searchQuery === '' ||
        poem.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        poem.poetName.toLowerCase().includes(searchQuery.toLowerCase());

    const categoryMatch = categoryFilter === 'all' || poem.category === categoryFilter;

    const yearMatch = (() => {
        if (yearFilter === 'all') return true;
        if (!poem.submission_date) return false;
        const submissionDate = new Date(poem.submission_date);
        return submissionDate.getFullYear() === Number(yearFilter);
    })();

    return searchMatch && categoryMatch && yearMatch;
  });

  const renderView = () => {
    if (selectedPoem) {
      return <PoemDetail poem={selectedPoem} onClose={() => setSelectedPoem(null)} onLike={handleLike} onShare={setPoemToShare} likingId={likingId} />;
    }
    
    if (currentView === 'admin_login') {
      return <AdminLoginPage onLoginSuccess={handleAdminLoginSuccess} />;
    }
    
    switch (currentView) {
      case 'submit':
        return <PoemForm onSubmit={handleAddPoem} categories={uniqueCategories} />;
      case 'library':
        return <PoetryLibrary poems={filteredPoems} onSelectPoem={setSelectedPoem} />;
      case 'fame':
        return (
            <div className="hall-of-fame-container">
              <HallOfFame poems={poems} />
            </div>
        );
      case 'admin':
        return isAdmin ? <AdminPanel poems={poems} onDelete={handleDeletePoem} onEdit={setEditingPoem} onRefreshPoems={fetchPoems} /> : <AdminLoginPage onLoginSuccess={handleAdminLoginSuccess} />;
      case 'all':
      default:
        return (
          <div className="all-poems-view-container">
            <div className="filters-container">
                <input
                    type="text"
                    placeholder="Tìm theo tên bài thơ, tác giả..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                    aria-label="Tìm kiếm bài thơ"
                />
                <div className="filter-group">
                  <label htmlFor="year-filter">Năm:</label>
                  <select id="year-filter" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                      <option value="all">Tất cả các năm</option>
                      {availableYears.map(year => (
                          <option key={year} value={year}>{year}</option>
                      ))}
                  </select>
                </div>
                <div className="filter-group">
                  <label htmlFor="category-filter">Chủ đề:</label>
                  <select id="category-filter" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                      <option value="all">Tất cả chủ đề</option>
                      {uniqueCategories.map(cat => (
                         <option key={cat} value={cat}>{cat}</option>
                      ))}
                  </select>
                </div>
            </div>
            <PoemList poems={filteredPoems} onSelect={setSelectedPoem} onLike={handleLike} likingId={likingId} />
          </div>
        );
    }
  };
  
  const handleNavClick = (view: View) => {
    setSelectedPoem(null);
    if (view === 'admin' && !isAdmin) {
      setCurrentView('admin_login');
    } else {
      setCurrentView(view);
    }
  };

  return (
    <div className="container">
      {isLoading && <GlobalLoadingSpinner />}
      <Header 
        currentView={currentView} 
        setCurrentView={handleNavClick} 
        isAdmin={isAdmin} 
        onAdminLogout={handleAdminLogout} 
      />
      <main>
        {renderView()}
      </main>
      {editingPoem && <EditModal poem={editingPoem} onUpdate={handleUpdatePoem} onCancel={() => setEditingPoem(null)} categories={uniqueCategories} />}
      {poemToShare && <ShareableCardModal poem={poemToShare} onClose={handleCloseShareModal} />}
    </div>
  );
};

const Header = ({ currentView, setCurrentView, isAdmin, onAdminLogout }: { currentView: View, setCurrentView: (view: View) => void, isAdmin: boolean, onAdminLogout: () => void }) => (
  <header>
    <div className="logo">
        <svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" height="40px" viewBox="0 0 24 24" width="40px" fill="currentColor"><g><rect fill="none" height="24" width="24"/></g><g><path d="M20.41,8.41l-4.83-4.83C15.21,3.21,14.7,3,14.17,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V9.83 C21,9.3,20.79,8.79,20.41,8.41z M7,17h10v-2H7V17z M12,13H7v-2h5V13z M15,9H7V7h8V9z"/></g></svg>
        <div className="logo-text">
            <h1>DÒNG CHẢY CẢM XÚC</h1>
            <p>“Nơi những vần thơ được chắp cánh bay cao, lưu giữ những kỷ niệm và cảm xúc bất tận.”</p>
        </div>
    </div>
    <nav>
        <div className="main-nav">
          <button className={currentView === 'all' ? 'active' : ''} onClick={() => setCurrentView('all')}>Tất cả bài thơ</button>
          <button className={currentView === 'library' ? 'active' : ''} onClick={() => setCurrentView('library')}>Thư viện thơ</button>
          <button className={currentView === 'submit' ? 'active' : ''} onClick={() => setCurrentView('submit')}>Đăng bài thơ</button>
          <button className={currentView === 'fame' ? 'active' : ''} onClick={() => setCurrentView('fame')}>Vinh danh</button>
          {isAdmin ? (
             <button className={`admin-btn ${currentView === 'admin' ? 'active' : ''}`} onClick={() => setCurrentView('admin')}>Quản trị</button>
          ) : (
            <button className="admin-btn" onClick={() => setCurrentView('admin_login')}>Quản trị</button>
          )}
        </div>
        <div className="user-nav">
            {isAdmin && <button className="logout-btn" onClick={onAdminLogout}>Đăng xuất Q.trị</button>}
        </div>
    </nav>
  </header>
);

const AdminLoginPage = ({ onLoginSuccess }: { onLoginSuccess: () => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'sohaco@123') {
      onLoginSuccess();
    } else {
      setError('Tên đăng nhập hoặc mật khẩu không đúng');
    }
  };

  return (
    <div className="login-container">
        <form onSubmit={handleSubmit} className="login-form">
            <h2>Đăng nhập Quản trị</h2>
            <input
                type="text"
                placeholder="Tên đăng nhập"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            />
            <input
                type="password"
                placeholder="Mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit">Đăng nhập</button>
            {error && <p className="login-error">{error}</p>}
        </form>
    </div>
  );
};


const PoemList = ({ poems, onSelect, onLike, likingId }: { poems: Poem[], onSelect: (poem: Poem) => void, onLike: (id: number) => void, likingId: number | null }) => {
  if (poems.length === 0) {
    return <p className="empty-state">Không tìm thấy bài thơ nào phù hợp.</p>;
  }

  const groupedPoems = useMemo(() => {
    return poems.reduce((acc, poem) => {
      const category = poem.category?.trim() || otherCategoryName;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(poem);
      return acc;
    }, {} as Record<string, Poem[]>);
  }, [poems]);

  const sortedCategories = useMemo(() => {
    return sortCategories(Object.keys(groupedPoems));
  }, [groupedPoems]);

  return (
    <div className="categorized-poem-list">
      {sortedCategories.map(category => (
        <section 
          key={category} 
          className="category-group"
        >
          <h2 className="category-title">{category}</h2>
          <div className="poem-list">
            {groupedPoems[category].map(poem => {
              const submissionDate = poem.submission_date ? new Date(poem.submission_date) : null;
              const formattedDate = submissionDate 
                  ? `T${submissionDate.getMonth() + 1}/${submissionDate.getFullYear()}` 
                  : '';
              
              return (
                  <div key={poem.id} className="poem-card-container" onClick={() => onSelect(poem)}>
                    <div className="poem-card">
                      <div className="card-image-container">
                          <img src={poem.backgroundImage || DEFAULT_BACKGROUND_IMAGE} alt={`Nền cho bài thơ ${poem.title}`} className="card-background-image" />
                      </div>
                      <div className="card-content">
                        <h3>{poem.title}</h3>
                        <p className="card-poem-content">{createExcerpt(poem.content, 150)}</p>
                      </div>
                    </div>
                    <div className="card-footer">
                      <div className="card-poet-info">
                        <p>Tác giả: <strong>{poem.poetName}</strong></p>
                        <p className="card-date">{formattedDate}</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); onLike(poem.id); }} disabled={likingId === poem.id} className="like-btn">
                        {likingId === poem.id ? (
                            <div className="spinner-small"></div>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                        )}
                        <span>{poem.likes}</span>
                      </button>
                    </div>
                  </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

const PoetryLibrary = ({ poems, onSelectPoem }: { poems: Poem[], onSelectPoem: (poem: Poem) => void }) => {
    const [openCategory, setOpenCategory] = useState<string | null>(null);

    const groupedPoems = useMemo(() => {
        return poems.reduce((acc, poem) => {
            const category = poem.category?.trim() || otherCategoryName;
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(poem);
            return acc;
        }, {} as Record<string, Poem[]>);
    }, [poems]);

    const sortedCategories = useMemo(() => {
        return sortCategories(Object.keys(groupedPoems));
    }, [groupedPoems]);

    const toggleCategory = (category: string) => {
        setOpenCategory(prev => (prev === category ? null : category));
    };

    if (poems.length === 0) {
        return <p className="empty-state">Không có bài thơ nào trong thư viện.</p>;
    }
    
    return (
        <div className="poetry-library-container">
            {sortedCategories.map(category => (
                <div key={category} className="library-category-item">
                    <button className="library-category-header" onClick={() => toggleCategory(category)}>
                        <span className="category-name">{category}</span>
                        <div className="category-details">
                            <span className="poem-count">{groupedPoems[category].length} bài thơ</span>
                            <svg className={`toggle-icon ${openCategory === category ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
                        </div>
                    </button>
                    <div className={`library-poem-list ${openCategory === category ? 'open' : ''}`}>
                        <ul>
                            {groupedPoems[category].map(poem => (
                                <li key={poem.id} className="poem-entry" onClick={() => onSelectPoem(poem)}>
                                    <span className="poem-title">{poem.title}</span>
                                    <span className="poem-author">Tác giả: {poem.poetName}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            ))}
        </div>
    );
};


const PoemDetail = ({ poem, onClose, onLike, onShare, likingId }: { poem: Poem, onClose: () => void, onLike: (id: number) => void, onShare: (poem: Poem) => void, likingId: number | null }) => (
  <div className="poem-detail-view">
    <div className="detail-actions">
        <button onClick={onClose} className="back-btn">&larr; Quay lại danh sách</button>
        <button onClick={() => onShare(poem)} className="download-card-btn-detail">Tải Card</button>
    </div>
    <div className="poem-detail-card">
      <img src={poem.backgroundImage || DEFAULT_BACKGROUND_IMAGE} alt={`Nền cho bài thơ ${poem.title}`} className="detail-background-image" />
      <div className="detail-content">
        <div className="detail-header">
            <div>
              <h2>{poem.title}</h2>
              <p className="detail-category">{poem.category}</p>
            </div>
            <button onClick={() => onLike(poem.id)} disabled={likingId === poem.id} className="like-btn detail-like-btn">
              {likingId === poem.id ? (
                      <div className="spinner-small"></div>
                  ) : (
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              )}
              <span>{poem.likes}</span>
            </button>
        </div>
        <div className="detail-poet-info">
            <span><strong>Tác giả:</strong> {poem.poetName}</span>
            {poem.submission_date && <span><strong>Ngày sáng tác:</strong> {new Date(poem.submission_date).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' })}</span>}
            <span><strong>Ngày đăng:</strong> {new Date(poem.timestamp).toLocaleDateString('vi-VN')}</span>
        </div>
        <div className="detail-full-content" dangerouslySetInnerHTML={{ __html: poem.content }}></div>
      </div>
    </div>
  </div>
);

const WysiwygEditor = ({ value, onChange }: { value: string, onChange: (value: string) => void }) => {
    const editorRef = useRef<HTMLDivElement>(null);

    const handleContentChange = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    };

    const execCmd = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
        handleContentChange();
    };
    
    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value;
        }
    }, [value]);

    return (
        <div className="wysiwyg-editor">
            <div className="wysiwyg-toolbar">
                <button type="button" onClick={() => execCmd('bold')}><b>B</b></button>
                <button type="button" onClick={() => execCmd('italic')}><i>I</i></button>
                <button type="button" onClick={() => execCmd('underline')}><u>U</u></button>
                <button type="button" onClick={() => execCmd('justifyLeft')}>Left</button>
                <button type="button" onClick={() => execCmd('justifyCenter')}>Center</button>
                <button type="button" onClick={() => execCmd('justifyRight')}>Right</button>
                <select onChange={(e) => execCmd('fontSize', e.target.value)}>
                    <option value="3">Normal</option>
                    <option value="5">Heading</option>
                    <option value="2">Small</option>
                </select>
                <input type="color" onChange={(e) => execCmd('foreColor', e.target.value)} />
            </div>
            <div
                ref={editorRef}
                className="wysiwyg-content"
                contentEditable
                onInput={handleContentChange}
                onBlur={handleContentChange} // To save changes when user clicks out
            />
        </div>
    );
};


const PoemForm = ({ onSubmit, categories }: { onSubmit: (poem: Omit<Poem, 'id' | 'timestamp' | 'likes'>) => void, categories: string[] }) => {
  const [poetName, setPoetName] = useState('');
  const [submissionDate, setSubmissionDate] = useState(new Date().toISOString().slice(0, 7));
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [backgroundImage, setBackgroundImage] = useState('');
  const [fileName, setFileName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [localCategories, setLocalCategories] = useState(categories);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');


  useEffect(() => {
    setLocalCategories(prev => {
        const combined = new Set([...categories, ...prev]);
        return sortCategories(Array.from(combined));
    });
  }, [categories]);

  const handleConfirmAddCategory = () => {
    const trimmedNewCategory = newCategoryName.trim();
    if (trimmedNewCategory === '') {
        setIsAddingCategory(false);
        setNewCategoryName('');
        return;
    }

    const existingCategory = localCategories.find(
        cat => cat.toLowerCase() === trimmedNewCategory.toLowerCase()
    );

    if (existingCategory) {
        setCategory(existingCategory);
    } else {
        setLocalCategories(prev => sortCategories([...prev, trimmedNewCategory]));
        setCategory(trimmedNewCategory);
    }
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  const handleNewCategoryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirmAddCategory();
      } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsAddingCategory(false);
          setNewCategoryName('');
      }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      alert("Tệp ảnh quá lớn. Vui lòng chọn ảnh có dung lượng dưới 10MB.");
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    setFileName('Đang xử lý ảnh...');

    try {
        const resizedBlob = await new Promise<Blob>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (!event.target?.result) {
                    return reject(new Error("Không thể đọc tệp ảnh."));
                }
                const img = new Image();
                img.onload = () => {
                    const MAX_WIDTH = 1280;
                    const MAX_HEIGHT = 1280;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        canvas.toBlob((blob) => {
                            if (blob) {
                                resolve(blob);
                            } else {
                                reject(new Error("Không thể chuyển đổi ảnh sang định dạng phù hợp."));
                            }
                        }, 'image/jpeg', 0.85);
                    } else {
                        reject(new Error("Không thể xử lý ảnh."));
                    }
                };
                img.onerror = () => reject(new Error("Tệp ảnh bị lỗi hoặc không được hỗ trợ."));
                img.src = event.target.result as string;
            };
            reader.onerror = () => reject(new Error("Đã có lỗi xảy ra khi đọc tệp."));
            reader.readAsDataURL(file);
        });

        const fileExt = file.name.split('.').pop() || 'jpg';
        const filePath = `public/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('poem-images')
            .upload(filePath, resizedBlob, {
                cacheControl: '3600',
                upsert: false,
            });

        if (uploadError) {
            throw uploadError;
        }

        const { data } = supabase.storage.from('poem-images').getPublicUrl(filePath);

        if (!data.publicUrl) {
            throw new Error("Không thể lấy đường dẫn công khai của ảnh.");
        }

        setBackgroundImage(data.publicUrl);
        setFileName(file.name);

    } catch (error: any) {
        alert(`Lỗi tải ảnh lên: ${parseSupabaseError(error)}`);
        setFileName('');
        setBackgroundImage('');
        if (e.target) e.target.value = '';
    } finally {
        setIsUploading(false);
    }
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poetName || !title || !content || !category || !submissionDate) {
      alert('Vui lòng điền đầy đủ các trường bắt buộc.');
      return;
    }
    onSubmit({ poetName, submission_date: `${submissionDate}-01`, title, category, content, backgroundImage });
  };
  
  return (
    <form onSubmit={handleSubmit} className="poem-form">
      <h2>Đăng bài thơ mới</h2>
      <div className="form-grid">
        <input type="text" placeholder="Tác giả / Họ và tên (*)" value={poetName} onChange={e => setPoetName(e.target.value)} required />
        <input type="text" placeholder="Tên bài thơ (*)" value={title} onChange={e => setTitle(e.target.value)} required />
        <div className="category-input-group">
            {isAddingCategory ? (
                <div className="new-category-form">
                    <input
                        type="text"
                        placeholder="Nhập tên chủ đề mới..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={handleNewCategoryKeyDown}
                        className="new-category-input"
                        autoFocus
                    />
                    <button type="button" onClick={handleConfirmAddCategory} className="new-category-submit-btn" title="Thêm">
                        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                    </button>
                    <button type="button" onClick={() => { setIsAddingCategory(false); setNewCategoryName(''); }} className="new-category-cancel-btn" title="Hủy">
                        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
                    </button>
                </div>
            ) : (
                <>
                    <select
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                        required
                    >
                        <option value="" disabled>Chọn một chủ đề...</option>
                        {localCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                    <button type="button" className="add-category-btn" onClick={() => setIsAddingCategory(true)} title="Thêm chủ đề mới">+</button>
                </>
            )}
        </div>
        <div className="date-input-container">
            <label htmlFor="submission-date">Ngày sáng tác (*)</label>
            <input id="submission-date" type="month" value={submissionDate} onChange={e => setSubmissionDate(e.target.value)} required />
        </div>
      </div>
      <WysiwygEditor value={content} onChange={setContent} />
      <div className="form-footer">
        <div className="file-input-wrapper">
            <label htmlFor="background-image" className={`file-upload-label ${isUploading ? 'uploading' : ''}`}>
                {isUploading ? 'Đang xử lý ảnh...' : (fileName || 'Tải ảnh nền (Tùy chọn)')}
            </label>
            <input id="background-image" type="file" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
        </div>
        <p>(*) là trường bắt buộc</p>
        <button type="submit" disabled={isUploading}>{isUploading ? 'Vui lòng chờ...' : 'Gửi bài thơ'}</button>
      </div>
    </form>
  );
};

const AdminPanel = ({ poems, onDelete, onEdit, onRefreshPoems }: { poems: Poem[], onDelete: (id: number) => void, onEdit: (poem: Poem) => void, onRefreshPoems: () => void }) => {
    const [activeTab, setActiveTab] = useState('summary');
    const [migrationStatus, setMigrationStatus] = useState({
        running: false,
        progress: 0,
        total: 0,
        log: [] as string[]
    });
    
    const poemsToMigrate = useMemo(() => {
        return poems.filter(p => {
            const bgImg = p.backgroundImage;
            if (!bgImg || typeof bgImg !== 'string') {
                return false;
            }
            // The check is made more lenient, using includes() instead of startsWith()
            // to catch data URIs that might have leading non-standard whitespace or characters.
            const cleanedBgImg = bgImg.trim();
            return cleanedBgImg.includes('data:image') && cleanedBgImg.includes(';base64,');
        });
    }, [poems]);

    const handleExportExcel = () => {
        if (!XLSX) {
            alert("Thư viện xuất Excel chưa được tải. Vui lòng kiểm tra lại kết nối.");
            return;
        }

        const dataToExport = poems.map(poem => ({
            'Tên bài thơ': poem.title,
            'Tác giả': poem.poetName,
            'Ngày sáng tác': poem.submission_date ? new Date(poem.submission_date).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }) : '',
            'Nội dung': createExcerpt(poem.content, 32767),
            'Ngày đăng': new Date(poem.timestamp).toLocaleDateString('vi-VN')
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Danh sách Thơ');
        XLSX.writeFile(wb, 'danh-sach-tho.xlsx');
    };

    const dataURItoBlob = (dataURI: string): Blob => {
        const byteString = atob(dataURI.split(',')[1]);
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mimeString });
    };

    const handleStartMigration = async () => {
        if (poemsToMigrate.length === 0) {
            alert("Không tìm thấy ảnh nào cần di chuyển.");
            return;
        }

        if (!window.confirm(`Bạn có chắc chắn muốn bắt đầu di chuyển ${poemsToMigrate.length} ảnh không? Hành động này sẽ quét toàn bộ dữ liệu và có thể mất nhiều thời gian.`)) {
            return;
        }
        
        const initialLogMessage = `Bắt đầu di chuyển ${poemsToMigrate.length} ảnh...`;
        setMigrationStatus({
            running: true,
            progress: 0,
            total: poemsToMigrate.length,
            log: [initialLogMessage]
        });

        for (const poem of poemsToMigrate) {
            let logMessage = '';
            try {
                // The poem object still holds the original, potentially untrimmed string.
                // It's crucial to trim it here as well before processing.
                const blob = dataURItoBlob(poem.backgroundImage.trim());
                if (!blob) throw new Error("Không thể chuyển đổi data URI thành Blob.");

                const fileExt = blob.type.split('/')[1] || 'jpg';
                const filePath = `public/migrated-${poem.id}-${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('poem-images')
                    .upload(filePath, blob, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: blob.type,
                    });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage.from('poem-images').getPublicUrl(filePath);
                if (!urlData.publicUrl) throw new Error("Không thể lấy đường dẫn công khai của ảnh.");

                const { error: updateError } = await supabase
                    .from('poems')
                    .update({ background_image: urlData.publicUrl })
                    .eq('id', poem.id);
                
                if (updateError) throw updateError;
                
                logMessage = `[THÀNH CÔNG] Bài thơ #${poem.id} (${poem.title}) đã được di chuyển.`;

            } catch (error: any) {
                logMessage = `[LỖI] Bài thơ #${poem.id} (${poem.title}): ${parseSupabaseError(error)}`;
            } finally {
                setMigrationStatus(prev => ({
                    ...prev,
                    progress: prev.progress + 1,
                    log: [...prev.log, logMessage]
                }));
            }
        }
        
        const finalLogMessage = "--- HOÀN TẤT QUÁ TRÌNH DI CHUYỂN ---";
        setMigrationStatus(prev => ({
             ...prev, 
             running: false,
             log: [...prev.log, finalLogMessage]
        }));
        
        alert("Đã di chuyển xong! Vui lòng làm mới trang để xem kết quả và kiểm tra log để xem chi tiết.");
        onRefreshPoems();
    };

    const SummaryDashboard = () => {
        const totalPoems = poems.length;
        const totalPoets = new Set(poems.map(p => p.poetName)).size;

        const poemsByMonth = poems.reduce((acc, poem) => {
             if (!poem.submission_date) return acc;
            const subDate = new Date(poem.submission_date);
            const year = subDate.getFullYear();
            const month = subDate.getMonth() + 1;
            const monthKey = `T${month}/${year}`;
            acc[monthKey] = (acc[monthKey] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const sortedMonths = Object.entries(poemsByMonth).sort(([keyA], [keyB]) => {
            const [, monthAStr, yearAStr] = keyA.match(/T(\d+)\/(\d+)/) || [];
            const [, monthBStr, yearBStr] = keyB.match(/T(\d+)\/(\d+)/) || [];
            const monthNumA = parseInt(monthAStr) || 0;
            const monthNumB = parseInt(monthBStr) || 0;
            const yearA = parseInt(yearAStr) || 0;
            const yearB = parseInt(yearBStr) || 0;

            if (yearA !== yearB) return yearA - yearB;
            return monthNumA - monthNumB;
        });

        const maxPoemsInMonth = Math.max(...Object.values(poemsByMonth), 0);
        
        return (
            <div className="summary-dashboard">
                <h3>Tổng quan</h3>
                <div className="stat-cards-container">
                    <div className="stat-cards">
                        <div className="stat-card">
                            <div className="value">{totalPoems}</div>
                            <div className="label">Tổng số bài thơ</div>
                        </div>
                         <div className="stat-card">
                            <div className="value">{totalPoets}</div>
                            <div className="label">Tổng số tác giả</div>
                        </div>
                        <div className="stat-card">
                            <div className="value">{new Set(poems.map(r => r.title)).size}</div>
                            <div className="label">Tổng số tác phẩm</div>
                        </div>
                    </div>
                </div>

                <h4>Số bài thơ theo tháng</h4>
                <div className="chart-container">
                    {sortedMonths.map(([month, count]) => (
                        <div key={month} className="bar-wrapper">
                            <div className="bar-label">{month} ({count})</div>
                            <div className="bar" style={{ width: `${(count / maxPoemsInMonth) * 70}%` }}></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const PoemManagement = () => (
        <div className="dashboard">
             <h3>Danh sách bài thơ</h3>
            <div className="table-container">
            <table>
                <thead>
                <tr>
                    <th>Tên bài thơ</th>
                    <th>Tác giả</th>
                    <th>Ngày sáng tác</th>
                    <th>Ngày đăng</th>
                    <th>Hành động</th>
                </tr>
                </thead>
                <tbody>
                {poems.map(poem => (
                    <tr key={poem.id}>
                    <td>{poem.title}</td>
                    <td>{poem.poetName}</td>
                    <td>{poem.submission_date ? new Date(poem.submission_date).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }) : ''}</td>
                    <td>{new Date(poem.timestamp).toLocaleDateString('vi-VN')}</td>
                    <td>
                        <button className="edit-btn" onClick={() => onEdit(poem)}>Sửa</button>
                        <button className="delete-btn" onClick={() => onDelete(poem.id)}>Xóa</button>
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        </div>
    );

    const MigrationTool = () => (
         <div className="migration-tool">
            <h3>Công cụ di chuyển dữ liệu</h3>
            <p>
                Chức năng này sẽ quét tất cả các bài thơ và di chuyển những ảnh nền đang được lưu trực tiếp trong cơ sở dữ liệu (dưới dạng base64) sang Supabase Storage.
                Điều này giúp tối ưu hóa dung lượng và tăng tốc độ tải trang.
            </p>
            <p>
                <strong>Lưu ý:</strong> Quá trình này có thể mất vài phút tùy thuộc vào số lượng ảnh. Vui lòng không đóng tab trình duyệt khi đang thực hiện. Chỉ nên thực hiện chức năng này một lần.
            </p>
             {poemsToMigrate.length > 0 ? (
                <p><strong>Trạng thái:</strong> Tìm thấy <strong>{poemsToMigrate.length}</strong> ảnh cần được di chuyển.</p>
            ) : (
                <p><strong>Trạng thái:</strong> Tuyệt vời! Tất cả ảnh đã được tối ưu hóa trên Storage.</p>
            )}
            <button onClick={handleStartMigration} disabled={migrationStatus.running || poemsToMigrate.length === 0}>
                {migrationStatus.running ? 'Đang di chuyển...' : 'Bắt đầu di chuyển ảnh sang Storage'}
            </button>
            {migrationStatus.total > 0 && (
                <div className="migration-progress">
                    <p>Tiến trình: {migrationStatus.progress} / {migrationStatus.total}</p>
                    <progress value={migrationStatus.progress} max={migrationStatus.total}></progress>
                    <pre className="migration-log">
                        {migrationStatus.log.join('\n')}
                    </pre>
                </div>
            )}
        </div>
    );

    return (
        <div className="admin-panel">
            <div className="admin-header">
                <h2>Bảng điều khiển Quản trị</h2>
                 <div className="admin-controls">
                    <button className="export-btn" onClick={handleExportExcel}>Tải danh sách (Excel)</button>
                </div>
            </div>

            <div className="admin-tabs">
                <button onClick={() => setActiveTab('summary')} className={activeTab === 'summary' ? 'active' : ''}>Tổng quan</button>
                <button onClick={() => setActiveTab('poems')} className={activeTab === 'poems' ? 'active' : ''}>Quản lý bài thơ</button>
                <button onClick={() => setActiveTab('tools')} className={activeTab === 'tools' ? 'active' : ''}>Công cụ</button>
            </div>
            
            <div className="admin-tab-content">
                {activeTab === 'summary' && <SummaryDashboard />}
                {activeTab === 'poems' && <PoemManagement />}
                {activeTab === 'tools' && <MigrationTool />}
            </div>
        </div>
    );
};


const EditModal = ({ poem, onUpdate, onCancel, categories }: { poem: Poem, onUpdate: (poem: Poem) => void, onCancel: () => void, categories: string[] }) => {
    const [updatedPoem, setUpdatedPoem] = useState(poem);
    const [isUploading, setIsUploading] = useState(false);
    const [fileName, setFileName] = useState(poem.backgroundImage ? 'Ảnh hiện tại' : '');

    useEffect(() => {
        setUpdatedPoem(poem);
        setFileName(poem.backgroundImage ? 'Ảnh hiện tại' : 'Chưa có ảnh');
    }, [poem]);

    const formatTimestampForInput = (ts: number) => {
        const date = new Date(ts);
        const timezoneOffset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - timezoneOffset);
        return localDate.toISOString().slice(0, 16);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setUpdatedPoem(prevState => {
            const newState = { ...prevState };
            if (name === "timestamp") {
                newState.timestamp = new Date(value).getTime();
            } else {
                // @ts-ignore
                newState[name] = value;
            }
            return newState;
        });
    };

    const handleContentChange = (content: string) => {
        setUpdatedPoem(prevState => ({ ...prevState, content }));
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) { // 10MB limit
          alert("Tệp ảnh quá lớn. Vui lòng chọn ảnh có dung lượng dưới 10MB.");
          e.target.value = '';
          return;
        }

        setIsUploading(true);
        setFileName('Đang xử lý ảnh...');

        try {
            const resizedBlob = await new Promise<Blob>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (!event.target?.result) {
                        return reject(new Error("Không thể đọc tệp ảnh."));
                    }
                    const img = new Image();
                    img.onload = () => {
                        const MAX_WIDTH = 1280;
                        const MAX_HEIGHT = 1280;
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > MAX_WIDTH) {
                                height *= MAX_WIDTH / width;
                                width = MAX_WIDTH;
                            }
                        } else {
                            if (height > MAX_HEIGHT) {
                                width *= MAX_HEIGHT / height;
                                height = MAX_HEIGHT;
                            }
                        }

                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(img, 0, 0, width, height);
                            canvas.toBlob((blob) => {
                                if (blob) {
                                    resolve(blob);
                                } else {
                                    reject(new Error("Không thể chuyển đổi ảnh sang định dạng phù hợp."));
                                }
                            }, 'image/jpeg', 0.85);
                        } else {
                            reject(new Error("Không thể xử lý ảnh."));
                        }
                    };
                    img.onerror = () => reject(new Error("Tệp ảnh bị lỗi hoặc không được hỗ trợ."));
                    img.src = event.target.result as string;
                };
                reader.onerror = () => reject(new Error("Đã có lỗi xảy ra khi đọc tệp."));
                reader.readAsDataURL(file);
            });

            const fileExt = file.name.split('.').pop() || 'jpg';
            const filePath = `public/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('poem-images')
                .upload(filePath, resizedBlob, {
                    cacheControl: '3600',
                    upsert: false,
                });

            if (uploadError) {
                throw uploadError;
            }

            const { data } = supabase.storage.from('poem-images').getPublicUrl(filePath);

            if (!data.publicUrl) {
                throw new Error("Không thể lấy đường dẫn công khai của ảnh.");
            }

            setUpdatedPoem(prevState => ({ ...prevState, backgroundImage: data.publicUrl }));
            setFileName(file.name);

        } catch (error: any) {
            alert(`Lỗi tải ảnh lên: ${parseSupabaseError(error)}`);
            setFileName(updatedPoem.backgroundImage ? 'Ảnh hiện tại' : 'Chưa có ảnh');
            if (e.target) e.target.value = '';
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalPoem = { ...updatedPoem };
        // The value from a month input is 'YYYY-MM'. Append '-01' to make it a valid date for Supabase.
        if (finalPoem.submission_date && finalPoem.submission_date.length === 7) { 
            finalPoem.submission_date = `${finalPoem.submission_date}-01`;
        }
        onUpdate(finalPoem);
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h3>Chỉnh sửa bài thơ</h3>
                <form onSubmit={handleSubmit}>
                    <input type="text" name="title" value={updatedPoem.title} onChange={handleChange} placeholder="Tên bài thơ" required />
                    <input type="text" name="poetName" value={updatedPoem.poetName} onChange={handleChange} placeholder="Tác giả/Họ tên người đăng" required />
                     <input
                        type="text"
                        list="edit-categories-datalist"
                        name="category"
                        value={updatedPoem.category}
                        onChange={handleChange}
                        placeholder="Chủ đề thơ"
                        required
                    />
                    <datalist id="edit-categories-datalist">
                        {categories.map(cat => <option key={cat} value={cat} />)}
                    </datalist>
                    
                    <label className="datetime-label" htmlFor="submission-date-edit">Ngày sáng tác (*)</label>
                    <input
                        type="month"
                        id="submission-date-edit"
                        name="submission_date"
                        value={updatedPoem.submission_date?.slice(0, 7) || ''}
                        onChange={handleChange}
                        required
                    />

                    <label className="datetime-label" htmlFor="timestamp">Ngày đăng bài</label>
                    <input 
                        type="datetime-local" 
                        id="timestamp" 
                        name="timestamp"
                        value={formatTimestampForInput(updatedPoem.timestamp)} 
                        onChange={handleChange} 
                        required
                    />
                    <WysiwygEditor value={updatedPoem.content} onChange={handleContentChange} />
                    <div className="file-input-wrapper" style={{ marginTop: '15px' }}>
                        <label htmlFor="background-image-edit" className={`file-upload-label ${isUploading ? 'uploading' : ''}`}>
                            {isUploading ? 'Đang xử lý...' : (fileName || 'Tải ảnh nền mới')}
                        </label>
                        <input id="background-image-edit" type="file" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
                    </div>
                    <div className="modal-actions">
                        <button type="button" onClick={onCancel}>Hủy</button>
                        <button type="submit" disabled={isUploading}>{isUploading ? 'Vui lòng chờ...' : 'Cập nhật'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const HallOfFame = ({ poems }: { poems: Poem[] }) => {
    const authorStats = useMemo(() => {
        const poets = poems.reduce((acc, p) => {
            if (!p.poetName || !p.poetName.trim()) return acc;
            const key = p.poetName.trim().toLowerCase();
            
            if (!acc[key]) {
                acc[key] = {
                    likes: 0,
                    count: 0,
                    nameOccurrences: new Map<string, number>()
                };
            }
            
            acc[key].likes += p.likes || 0;
            acc[key].count += 1;
    
            const originalName = p.poetName.trim();
            acc[key].nameOccurrences.set(originalName, (acc[key].nameOccurrences.get(originalName) || 0) + 1);
            
            return acc;
        }, {} as Record<string, { likes: number; count: number; nameOccurrences: Map<string, number> }>);

        return Object.values(poets).map(stats => {
            let displayName = '';
            let maxOccurrences = 0;
            for (const [name, count] of stats.nameOccurrences.entries()) {
                if (count > maxOccurrences) {
                    maxOccurrences = count;
                    displayName = name;
                }
            }
            return { name: displayName, likes: stats.likes, count: stats.count };
        });
    }, [poems]);

    const topPoetsByLikes = useMemo(() => {
        return [...authorStats]
            .sort((a, b) => b.likes - a.likes)
            .slice(0, 5)
            .map(poet => ({ name: poet.name, value: poet.likes }));
    }, [authorStats]);

    const topPoetsByCount = useMemo(() => {
        return [...authorStats]
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map(poet => ({ name: poet.name, value: poet.count }));
    }, [authorStats]);

    const topPoems = useMemo(() => {
        return [...poems]
            .sort((a, b) => (b.likes || 0) - (a.likes || 0))
            .slice(0, 5)
            .map(p => ({ id: p.id, title: p.title, likes: p.likes || 0 }));
    }, [poems]);

    const totalPoems = poems.length;
    const totalAuthors = authorStats.length;

    return (
        <div className="hall-of-fame">
            <h2>SẢNH VINH DANH</h2>
            <p className="fame-intro">Vinh danh các tác giả và các tác phẩm nổi bật.</p>
            <div className="fame-summary-grid">
                <div className="fame-item fame-summary-item fame-item-liked">
                     <h3>
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                        Tổng số bài thơ
                    </h3>
                    <div className="summary-value">{totalPoems}</div>
                </div>
                <div className="fame-item fame-summary-item fame-item-active-poet">
                     <h3>
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                        Tổng số tác giả
                    </h3>
                    <div className="summary-value">{totalAuthors}</div>
                </div>
            </div>
            <div className="fame-grid">
                <div className="fame-item fame-item-liked">
                    <h3>
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                        Tác giả được yêu thích nhất
                    </h3>
                    <ol>{topPoetsByLikes.length > 0 ? topPoetsByLikes.map(poet => <li key={poet.name}><span>{poet.name}</span><strong>{poet.value.toString().padStart(2, '0')} lượt</strong></li>) : <li className="fame-empty">Chưa có dữ liệu</li>}</ol>
                </div>
                <div className="fame-item fame-item-active-poet">
                     <h3>
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"><path d="M0 0h24v24H0z" fill="none"/><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        Tác giả tích cực nhất
                    </h3>
                    <ol>{topPoetsByCount.length > 0 ? topPoetsByCount.map(poet => <li key={poet.name}><span>{poet.name}</span><strong>{poet.value} bài</strong></li>) : <li className="fame-empty">Chưa có dữ liệu</li>}</ol>
                </div>
                <div className="fame-item fame-item-poem">
                     <h3>
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"><path d="M0 0h24v24H0z" fill="none"/><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2-H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>
                        Bài thơ được yêu thích nhất
                    </h3>
                    <ol>{topPoems.length > 0 ? topPoems.map(poem => <li key={poem.id}><span>{poem.title}</span><strong>{poem.likes} lượt</strong></li>) : <li className="fame-empty">Chưa có dữ liệu</li>}</ol>
                </div>
            </div>
        </div>
    );
};


const ShareableCardModal = ({ poem, onClose }: { poem: Poem | null, onClose: () => void }) => {
    const cardRef = useRef(null);

    const handleDownload = () => {
        if (cardRef.current) {
            html2canvas(cardRef.current, { scale: 2 }).then(canvas => {
                const link = document.createElement('a');
                link.download = `tho-${poem?.title.replace(/\s+/g, '-').toLowerCase()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            });
        }
    };
    
    if (!poem) return null;

    return (
        <div className="share-card-modal-backdrop" onClick={onClose}>
            <div className="share-card-modal-content" onClick={e => e.stopPropagation()}>
                <h3>Card bài thơ</h3>
                <div ref={cardRef} className="shareable-card-container">
                    <div className="shareable-card-design">
                        <div className="share-card-header">
                            <div className="header-club-name">
                                <svg className="share-card-quill-icon" xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><g><rect fill="none" height="24" width="24"/></g><g><path d="M20.41,8.41l-4.83-4.83C15.21,3.21,14.7,3,14.17,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V9.83 C21,9.3,20.79,8.79,20.41,8.41z M7,17h10v-2H7V17z M12,13H7v-2h5V13z M15,9H7V7h8V9z"/></g></svg>
                                <span>DÒNG CHẢY CẢM XÚC</span>
                            </div>
                            <span className="header-card-title">{poem.submission_date ? new Date(poem.submission_date).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }) : ''}</span>
                        </div>
                        <div className="share-card-main-content">
                            <div className="share-card-image">
                                <img src={poem.backgroundImage || DEFAULT_BACKGROUND_IMAGE} alt={poem.title} />
                            </div>
                            <div className="share-card-poem-area">
                                <h2 className="share-card-poem-title">{poem.title}</h2>
                                <div className="share-card-full-content" dangerouslySetInnerHTML={{ __html: poem.content }}></div>
                            </div>
                        </div>
                        <div className="share-card-footer">
                            <span>Tác giả: {poem.poetName}</span>
                            <span>Ngày đăng: {new Date(poem.timestamp).toLocaleDateString('vi-VN')}</span>
                        </div>
                    </div>
                </div>
                <button onClick={handleDownload} className="download-card-btn">Tải Card</button>
            </div>
        </div>
    );
};

const GlobalLoadingSpinner = () => (
    <div className="global-loading-overlay">
        <div className="spinner"></div>
    </div>
);


const root = createRoot(document.getElementById('root')!);
root.render(<App />);
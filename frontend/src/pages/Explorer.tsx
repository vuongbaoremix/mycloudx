import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';

export default function Explorer() {
  const [memories, setMemories] = useState<any[]>([]);
  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [mems, screens, st] = await Promise.all([
          api.getMemories(),
          api.getExplorerScreenshots(),
          api.getExplorerStats()
        ]);
        setMemories(mems);
        setScreenshots(screens);
        setStats(st);
      } catch (err) {
        console.error("Failed to fetch explorer data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex bg-surface justify-center items-center h-[calc(100vh-8rem)] text-on-surface">
        <div className="animate-pulse flex flex-col items-center">
            <span className="material-symbols-outlined text-[40px] opacity-50 mb-4 animate-bounce" data-icon="explore">explore</span>
            <p className="text-on-surface-variant font-body">Đang tải dữ liệu Khám phá...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-surface text-on-surface font-body overflow-x-hidden pt-4">
      {/* Header */}
      <header className="px-6 py-4 sticky top-0 bg-surface/80 backdrop-blur-xl z-10 border-b border-outline-variant/15 mb-6">
        <h1 className="text-2xl font-extrabold font-headline tracking-tight text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[28px]" data-icon="explore">explore</span>
          Khám phá
        </h1>
      </header>

      <div className="px-6 space-y-12 pb-24">
        
        {/* Memories Section */}
        {memories.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold font-headline flex items-center gap-2 text-on-surface tracking-tight">
                <span className="material-symbols-outlined text-primary text-[24px]" data-icon="calendar_month">calendar_month</span>
                Ngày này năm xưa
              </h2>
            </div>
            
            <div className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory hide-scroll -mx-6 px-6">
              {memories.map((m, idx) => (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={m.id} 
                  className="flex-none w-[200px] md:w-[280px] aspect-[3/4] rounded-3xl overflow-hidden relative snap-center cursor-pointer shadow-lg group bg-surface-container"
                  onClick={() => navigate(`/?media=${m.id}`)}
                >
                  <img 
                    src={m.thumbnails?.medium || m.thumbnails?.web} 
                    alt={m.original_name}
                    className="object-cover w-full h-full transform transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                  <div className="absolute bottom-5 left-5 right-5 text-left pointer-events-none">
                    <p className="text-xs md:text-sm text-white/90 font-medium font-body mb-0.5 drop-shadow-md uppercase tracking-wider">Kỷ niệm</p>
                    <p className="text-2xl md:text-3xl font-extrabold font-headline text-white drop-shadow-md">
                      {new Date(m.created_at).getFullYear()}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Stats Banner */}
        {stats && (
          <section className="bg-surface-container-high rounded-3xl p-6 shadow-sm border border-outline-variant/15 relative overflow-hidden">
            <h2 className="text-lg font-bold font-headline mb-5 text-on-surface">Lưu trữ của bạn</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 relative z-10">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5 text-on-surface-variant font-label">
                  <span className="material-symbols-outlined text-[18px]" data-icon="image">image</span> Tổng số file
                </p>
                <p className="text-2xl font-extrabold font-headline text-on-surface">
                  {stats.total_files.toLocaleString()} <span className="text-sm font-semibold text-on-surface-variant font-body">mục</span>
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5 text-on-surface-variant font-label">
                  <span className="material-symbols-outlined text-[18px]" data-icon="cloud">cloud</span> Dung lượng
                </p>
                <p className="text-2xl font-extrabold font-headline text-primary">
                  {formatSize(stats.total_size)}
                </p>
              </div>
              <div className="flex flex-col gap-1 col-span-2 md:col-span-1">
                <p className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5 text-on-surface-variant font-label">
                  <span className="material-symbols-outlined text-[18px]" data-icon="play_circle">play_circle</span> Video
                </p>
                <p className="text-2xl font-extrabold font-headline text-on-surface">
                  {stats.video_count.toLocaleString()} <span className="text-sm font-semibold text-on-surface-variant font-body">mục</span>
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Explore Types */}
        <section>
          <h2 className="text-lg font-bold font-headline mb-4 border-b border-outline-variant/15 pb-2 text-on-surface">Danh mục nổi bật</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Link to="/videos" className="bg-surface-container hover:bg-surface-container-high transition-colors p-5 rounded-3xl flex flex-col items-center justify-center gap-3 group border border-outline-variant/5">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-[28px]" data-icon="play_circle">play_circle</span>
              </div>
              <span className="font-semibold font-headline text-on-surface text-[15px]">Video</span>
            </Link>

            <Link to="/map" className="bg-surface-container hover:bg-surface-container-high transition-colors p-5 rounded-3xl flex flex-col items-center justify-center gap-3 group border border-outline-variant/5">
               <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center text-success group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-[28px]" data-icon="distance">distance</span>
              </div>
              <span className="font-semibold font-headline text-on-surface text-[15px]">Bản đồ</span>
            </Link>
            
            <Link to="/favorites" className="bg-surface-container hover:bg-surface-container-high transition-colors p-5 rounded-3xl flex flex-col items-center justify-center gap-3 group border border-outline-variant/5 col-span-2 lg:col-span-1">
              <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center text-danger group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-[28px]" data-icon="favorite">favorite</span>
              </div>
              <span className="font-semibold font-headline text-on-surface text-[15px]">Yêu thích</span>
            </Link>
          </div>
        </section>

        {/* Screenshots Section */}
        {screenshots.length > 0 && (
          <section className="pb-8">
            <div className="flex items-center justify-between mb-4 border-b border-outline-variant/15 pb-2">
              <h2 className="text-lg font-bold font-headline flex items-center gap-2 text-on-surface">
                <span className="material-symbols-outlined text-tertiary text-[24px]" data-icon="screenshot_region">screenshot_region</span>
                Ảnh chụp màn hình
              </h2>
            </div>
            
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 md:gap-3">
              {screenshots.map((m) => (
                 <div
                   key={m.id}
                   className="aspect-[9/16] rounded-2xl overflow-hidden cursor-pointer group relative bg-surface-container border border-outline-variant/10 shadow-sm"
                   onClick={() => navigate(`/?media=${m.id}`)}
                 >
                   <img 
                     src={m.thumbnails?.medium || m.thumbnails?.small || m.thumbnails?.web}
                     alt="Screenshot"
                     className="w-full h-full object-cover transform transition-transform duration-500 group-hover:scale-105"
                     loading="lazy"
                   />
                   <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                 </div>
              ))}
            </div>
          </section>
        )}

      </div>
      
      <style>{`
        .hide-scroll::-webkit-scrollbar {
          display: none;
        }
        .hide-scroll {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ThemeConfig } from '../types';

interface BannerCarouselProps {
  theme: ThemeConfig;
}

const BANNERS = [
  {
    id: 1,
    src: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=1200&q=80",
    alt: "Công nghệ AI tiên tiến - Mạng nơ ron số",
    title: "Trí tuệ nhân tạo tiên tiến",
    desc: "Tự động hóa quy trình xử lý văn bản hành chính"
  },
  {
    id: 2,
    src: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=80",
    alt: "Công nghệ tương lai",
    title: "Công nghệ đột phá",
    desc: "Giải pháp chuyển đổi số toàn diện"
  },
  {
    id: 3,
    src: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80",
    alt: "Trung tâm dữ liệu",
    title: "Xử lý dữ liệu lớn",
    desc: "Hiệu suất cao, chính xác và nhanh chóng"
  },
  {
    id: 4,
    src: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80",
    alt: "Văn phòng hiện đại",
    title: "Văn phòng điện tử",
    desc: "Tiết kiệm thời gian, nâng cao năng suất"
  },
  {
    id: 5,
    src: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80",
    alt: "Bảo mật dữ liệu",
    title: "Bảo mật tuyệt đối",
    desc: "An toàn thông tin là ưu tiên hàng đầu"
  }
];

export const BannerCarousel: React.FC<BannerCarouselProps> = ({ theme }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto slide
  useEffect(() => {
    if (isHovered) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % BANNERS.length);
    }, 6000);

    return () => clearInterval(interval);
  }, [isHovered]);

  const prevSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? BANNERS.length - 1 : prev - 1));
  };

  const nextSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % BANNERS.length);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - left) / width - 0.5;
    const y = (e.clientY - top) / height - 0.5;

    setMousePos({ x, y });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setMousePos({ x: 0, y: 0 });
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full rounded-3xl overflow-hidden shadow-2xl transition-all duration-500 group mb-10 aspect-[21/9] sm:aspect-[3/1] bg-slate-900 perspective-1000"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      <style>{`
        .perspective-1000 {
          perspective: 2000px;
        }
        .banner-slide {
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: transform 1.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 1s ease, visibility 1s;
          pointer-events: none;
          transform-style: preserve-3d;
          visibility: hidden;
        }
        .banner-slide.active {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          z-index: 20;
          transform: translateZ(0) rotateY(0) scale(1);
        }
        /* Hiệu ứng 3D khi slide đi ra hoặc chuẩn bị đi vào */
        .banner-slide.inactive-next {
          opacity: 0;
          visibility: visible;
          transform: translateX(50%) translateZ(-400px) rotateY(-35deg);
          z-index: 10;
        }
        .banner-slide.inactive-prev {
          opacity: 0;
          visibility: visible;
          transform: translateX(-50%) translateZ(-400px) rotateY(35deg);
          z-index: 10;
        }
        
        .layer-depth-1 { transform: translateZ(20px); }
        .layer-depth-2 { transform: translateZ(40px); }
        .layer-depth-3 { transform: translateZ(70px); }
      `}</style>

      {/* Slides Container */}
      <div className="w-full h-full relative">
        {BANNERS.map((banner, index) => {
          const isActive = index === currentIndex;
          const isNext = index === (currentIndex + 1) % BANNERS.length;
          const isPrev = index === (currentIndex - 1 + BANNERS.length) % BANNERS.length;
          
          let statusClass = '';
          if (isActive) statusClass = 'active';
          else if (isNext) statusClass = 'inactive-next';
          else if (isPrev) statusClass = 'inactive-prev';

          return (
            <div 
              key={banner.id} 
              className={`banner-slide ${statusClass}`}
            >
              {/* Image Layer with Parallax */}
              <div 
                className="w-full h-full transition-transform duration-300 ease-out will-change-transform layer-depth-1"
                style={{ 
                  transform: isHovered && isActive
                    ? `scale(1.15) translate(${mousePos.x * -50}px, ${mousePos.y * -50}px)` 
                    : isActive ? 'scale(1.05)' : 'scale(1.2)',
                }}
              >
                <img 
                  src={banner.src} 
                  alt={banner.alt} 
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none z-10" />

              {/* Text Layer with Enhanced 3D Depth */}
              <div 
                className={`absolute inset-0 flex flex-col justify-end p-8 sm:p-14 pointer-events-none transition-all duration-1000 delay-100 z-20 ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
              >
                <div 
                  className="transition-transform duration-300 ease-out layer-depth-3"
                  style={{ 
                    transform: isHovered && isActive
                      ? `translate(${mousePos.x * 40}px, ${mousePos.y * 40}px)` 
                      : 'none',
                  }}
                >
                  <div className="overflow-hidden mb-2">
                    <h3 className="text-white text-2xl sm:text-5xl font-black drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] tracking-tight leading-tight uppercase">
                      {banner.title}
                    </h3>
                  </div>
                  <div className={`h-1.5 w-24 bg-${theme.primary}-500 mb-6 rounded-full shadow-lg shadow-${theme.primary}-500/50`} />
                </div>
                
                <div 
                  className="transition-transform duration-300 ease-out layer-depth-2"
                  style={{ 
                    transform: isHovered && isActive
                      ? `translate(${mousePos.x * 20}px, ${mousePos.y * 20}px)` 
                      : 'none',
                  }}
                >
                  <p className="text-white/90 text-sm sm:text-xl font-medium drop-shadow-md max-w-2xl leading-relaxed italic border-l-4 border-white/30 pl-6 backdrop-blur-[2px]">
                    {banner.desc}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Arrows - Glassmorphism style */}
      <button 
        onClick={prevSlide}
        className="absolute left-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/20 hover:bg-white/30 border border-white/10 backdrop-blur-xl text-white transition-all opacity-0 group-hover:opacity-100 z-50 hover:scale-110 active:scale-90 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
        aria-label="Previous slide"
      >
        <ChevronLeft size={28} />
      </button>
      <button 
        onClick={nextSlide}
        className="absolute right-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/20 hover:bg-white/30 border border-white/10 backdrop-blur-xl text-white transition-all opacity-0 group-hover:opacity-100 z-50 hover:scale-110 active:scale-90 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
        aria-label="Next slide"
      >
        <ChevronRight size={28} />
      </button>

      {/* Progress Indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-50 px-4 py-2 rounded-full bg-black/10 backdrop-blur-sm">
        {BANNERS.map((_, index) => (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              goToSlide(index);
            }}
            className={`h-1.5 rounded-full transition-all duration-700 shadow-sm overflow-hidden ${
              currentIndex === index 
                ? `bg-white w-14` 
                : 'bg-white/20 w-3 hover:bg-white/50'
            }`}
          >
            {currentIndex === index && !isHovered && (
              <div 
                className="h-full bg-white opacity-60"
                style={{ animation: 'progress 6s linear forwards' }}
              />
            )}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
};

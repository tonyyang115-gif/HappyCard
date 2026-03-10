import React from 'react';

interface AvatarProps {
  url: string;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20'
};

export const Avatar: React.FC<AvatarProps> = ({ url, alt, size = 'md', className = '' }) => {
  return (
    <div className={`relative rounded-lg overflow-hidden border border-gray-200 bg-gray-100 ${sizeClasses[size]} ${className}`}>
      <img src={url} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
};
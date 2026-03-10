import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'black' | 'wechat';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md',
  fullWidth = false, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2";
  
  const sizeStyles = {
    sm: "py-2 px-4 text-sm rounded-lg",
    md: "py-3 px-6 text-base rounded-xl",
    lg: "py-4 px-10 text-lg rounded-xl"
  };

  const variants = {
    primary: "bg-[#4c88ff] text-white hover:bg-[#3b76f6] shadow-lg shadow-blue-500/30", // App Blue
    wechat: "bg-[#07c160] text-white hover:bg-[#06ad56]", 
    secondary: "bg-white text-gray-900 border border-gray-200 hover:bg-gray-50",
    danger: "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100",
    black: "bg-[#1a1a1a] text-white hover:bg-black shadow-lg shadow-gray-500/20"
  };

  return (
    <button 
      className={`${baseStyles} ${sizeStyles[size]} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
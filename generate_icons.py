#!/usr/bin/env python3
"""生成 Chrome 扩展图标"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_gradient(size, color1, color2):
    """创建渐变背景"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    for y in range(size):
        for x in range(size):
            # 对角线渐变
            ratio = (x + y) / (2 * size)
            r = int(color1[0] * (1 - ratio) + color2[0] * ratio)
            g = int(color1[1] * (1 - ratio) + color2[1] * ratio)
            b = int(color1[2] * (1 - ratio) + color2[2] * ratio)
            img.putpixel((x, y), (r, g, b, 255))
    
    return img

def create_rounded_rect_mask(size, radius):
    """创建圆角矩形遮罩"""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (size-1, size-1)], radius=radius, fill=255)
    return mask

def create_icon(size, output_path):
    """创建单个图标"""
    # 渐变颜色
    color1 = (102, 126, 234)  # #667eea
    color2 = (118, 75, 162)   # #764ba2
    
    # 创建渐变背景
    img = create_gradient(size, color1, color2)
    
    # 应用圆角
    radius = size // 5
    mask = create_rounded_rect_mask(size, radius)
    
    # 创建透明背景并粘贴圆角图像
    result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    result.paste(img, mask=mask)
    
    # 添加文字 "译"
    draw = ImageDraw.Draw(result)
    
    # 尝试使用系统字体
    font_size = int(size * 0.55)
    try:
        # macOS 中文字体
        font = ImageFont.truetype('/System/Library/Fonts/PingFang.ttc', font_size)
    except:
        try:
            font = ImageFont.truetype('/System/Library/Fonts/STHeiti Light.ttc', font_size)
        except:
            font = ImageFont.load_default()
    
    text = "译"
    
    # 计算文字位置（居中）
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - bbox[1]
    
    # 绘制白色文字
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
    
    # 保存
    result.save(output_path, 'PNG')
    print(f'Created: {output_path}')

if __name__ == '__main__':
    icons_dir = 'icons'
    
    # 生成三种尺寸的图标
    create_icon(16, os.path.join(icons_dir, 'icon16.png'))
    create_icon(48, os.path.join(icons_dir, 'icon48.png'))
    create_icon(128, os.path.join(icons_dir, 'icon128.png'))
    
    print('Done!')

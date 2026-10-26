"""Generate the repository-native social card using existing brand typography."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
import tempfile
root = Path(__file__).resolve().parents[1]
font = TTFont(root/'dist/assets/manrope-500.woff');font.flavor=None
with tempfile.NamedTemporaryFile(suffix='.ttf') as file:
 font.save(file.name)
 image=Image.new('RGB',(1200,630),'#05090e');draw=ImageDraw.Draw(image)
 for x in range(660,1200,40):draw.line((x,0,x,630),fill='#0d1c27')
 for y in range(0,630,40):draw.line((660,y,1200,y),fill='#0d1c27')
 def text(x,y,value,size,color):draw.text((x,y),value,font=ImageFont.truetype(file.name,size),fill=color)
 text(65,48,'ARCHWOOD INNOVATIONS',20,'#9db7c8')
 draw.line((65,102,1135,102),fill='#243c4d',width=1)
 text(65,155,'Free website',67,'#f3f5f7');text(65,236,'security check.',67,'#62d4ff')
 text(68,356,'A clearer view of your digital defenses.',24,'#b2c6d3')
 text(68,414,'Free snapshot. Optional detailed report by email.',19,'#91aabd')
 text(68,548,'archwoodinnovations.com/website-security',18,'#b6d7e8')
 draw.ellipse((755,170,1105,520),outline='#294a5f',width=2)
 shield=[(930,190),(1045,235),(1045,337),(1029,392),(990,443),(930,480),(870,443),(831,392),(815,337),(815,235)]
 draw.polygon(shield,fill='#0c1e2c');draw.line(shield+[shield[0]],fill='#62d4ff',width=3)
 draw.line((930,190,930,480),fill='#21465e',width=1);draw.line((815,295,1045,295),fill='#21465e',width=1);draw.line((832,390,1028,390),fill='#21465e',width=1)
 draw.line((877,330,918,371,990,286),fill='#93dcfa',width=5)
 draw.ellipse((811,291,819,299),fill='#c79667');draw.ellipse((1041,291,1049,299),fill='#62d4ff')
 image.save(root/'dist/assets/website-security-share.png',optimize=True)

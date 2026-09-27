import struct
import sys

def png_to_ico(png_path, ico_path):
    try:
        with open(png_path, 'rb') as f:
            png_data = f.read()
        
        # ICO Header: Reserved(2 bytes), Type(2 bytes = 1 for icon), Count(2 bytes = 1 image)
        header = struct.pack('<HHH', 0, 1, 1)
        
        # ICO Directory Entry for 1 image:
        # Width (1 byte), Height (1 byte), Color count (1 byte)
        # Reserved (1 byte), Planes (2 bytes = 1), BPP (2 bytes = 32)
        # BytesInRes (4 bytes = size of PNG data)
        # ImageOffset (4 bytes = offset from start, which is 6 + 16 = 22)
        size = len(png_data)
        entry = struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, size, 22)
        
        with open(ico_path, 'wb') as f:
            f.write(header)
            f.write(entry)
            f.write(png_data)
        print(f"Successfully converted {png_path} to {ico_path}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python convert_icon.py <input.png> <output.ico>")
    else:
        png_to_ico(sys.argv[1], sys.argv[2])

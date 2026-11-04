---
quoted:
- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy "q" z
- aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  bbbbbbbbbbbbbbbbbbbb "q" cccccccccccccccccccccccccccccc
- short
double:
- "tab\there the quick brown fox jumps over the lazy dog. the quick brown fox jumps\
  \ over the lazy dog. the quick brown fox jumps over the lazy dog. the quick brown\
  \ fox jumps over the lazy dog. end"
- "nul\0 word word word word word word word word word word word word word word word\
  \ word word word word word word word word word word word word word word word end"
plain:
- plain wrapped words plain wrapped words plain wrapped words plain wrapped words
  plain wrapped words plain wrapped words plain wrapped words plain wrapped words
  end
- 'it''s, a: b'
multi:
- 'one

  two'
- 'gap


  three'
tail: v
---
# wrapped lists

Block-list items that PyYAML wraps over lines.

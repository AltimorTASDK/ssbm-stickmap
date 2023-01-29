/*********************************************************************************************************************************************************************************************
//*****SSSSSS**********SSSSSS*******BBBBBBBBBBB*****BMMMMM******MMMMMM**********RRRRRRRRRRR******EEEEEEEEEEEEE********GGGGGGG******GIII********OOOOOO********NNNN******NNNN******SSSSSSS******
//***SSSSSSSSSS******SSSSSSSSSS*****BBBBBBBBBBBBB***BMMMMMM*****MMMMMM**********RRRRRRRRRRRRR****EEEEEEEEEEEEE*****GGGGGGGGGGGG****GIII******OOOOOOOOOO******NNNNN*****NNNN****SSSSSSSSSSS****
//**SSSSSSSSSSSS****SSSSSSSSSSSS****BBBBBBBBBBBBB***BMMMMMM*****MMMMMM**********RRRRRRRRRRRRRR***EEEEEEEEEEEEE****GGGGGGGGGGGGGG***GIII*****OOOOOOOOOOOOO****NNNNN*****NNNN****SSSSSSSSSSSS***
//*SSSSSSSSSSSSS***SSSSSSSSSSSSS****BBBBBBBBBBBBBB**BMMMMMM****MMMMMMM**********RRRRRRRRRRRRRR***EEEEEEEEEEEEE***GGGGGGGGGGGGGGG***GIII****OOOOOOOOOOOOOO****NNNNNN****NNNN***SSSSSSSSSSSSS***
//*SSSSS****SSSSS**SSSSS****SSSSS***BBBB*****BBBBB**BMMMMMMM***MMMMMMM**********RRRR*****RRRRR***EEEE************GGGGG*****GGGGGG**GIII***OOOOOO****OOOOOO***NNNNNNN***NNNN***SSSS*****SSSS***
//*SSSSS****SSSSS**SSSSS****SSSSS***BBBB******BBBB**BMMMMMMM***MMMMMMM**********RRRR******RRRR***EEEE***********EGGGG*******GGG****GIII***OOOOO******OOOOO***NNNNNNN***NNNN***SSSSS****SSSS***
//*SSSSSSSS********SSSSSSSS*********BBBB*****BBBBB**BMMMMMMM**MMMMMMMM**********RRRR*****RRRRR***EEEE***********EGGGG**************GIII***OOOO********OOOOO**NNNNNNNN**NNNN***SSSSSSSS********
//**SSSSSSSSSS******SSSSSSSSSS******BBBBBBBBBBBBB***BMMMMMMMM*MMMMMMMM**********RRRRRRRRRRRRRR***EEEEEEEEEEEEE**EGGG***************GIII**IOOOO********OOOOO**NNNNNNNN**NNNN***SSSSSSSSSSS*****
//**SSSSSSSSSSSS****SSSSSSSSSSSS****BBBBBBBBBBBB****BMMMMMMMM*MMM*MMMM**********RRRRRRRRRRRRR****EEEEEEEEEEEEE**EGGG****GGGGGGGGG**GIII**IOOOO********OOOOO**NNNNNNNNN*NNNN****SSSSSSSSSSSS***
//****SSSSSSSSSSS*****SSSSSSSSSSS***BBBBBBBBBBBBB***BMMMMMMMM*MMM*MMMM**********RRRRRRRRRRRR*****EEEEEEEEEEEEE**EGGG****GGGGGGGGG**GIII**IOOOO********OOOOO**NNNN*NNNNNNNNN******SSSSSSSSSS***
//*******SSSSSSSS********SSSSSSSS***BBBBBBBBBBBBBB**BMMMM*MMMMMMM*MMMM**********RRRRRRRRRRR******EEEEEEEEEEEEE**EGGG****GGGGGGGGG**GIII**IOOOO********OOOOO**NNNN*NNNNNNNNN*********SSSSSSSS**
//*SSSS*****SSSSS**SSSS*****SSSSS***BBBB******BBBBB*BMMMM*MMMMMMM*MMMM**********RRRR**RRRRRR*****EEEE***********EGGGG***GGGGGGGGG**GIII***OOOO********OOOOO**NNNN**NNNNNNNN**NSSS******SSSSS**
//*SSSS******SSSS**SSSS******SSSS***BBBB******BBBBB*BMMMM*MMMMMMM*MMMM**********RRRR***RRRRRR****EEEE***********EGGGG********GGGG**GIII***OOOOO******OOOOO***NNNN**NNNNNNNN**NSSSS******SSSS**
//*SSSSS****SSSSS**SSSSS****SSSSS***BBBB******BBBBB*BMMMM*MMMMMM**MMMM**********RRRR****RRRRR****EEEE************GGGGG*****GGGGGG**GIII***OOOOOO****OOOOOO***NNNN***NNNNNNN***SSSSS****SSSSS**
//*SSSSSSSSSSSSSS**SSSSSSSSSSSSSS***BBBBBBBBBBBBBB**BMMMM**MMMMM**MMMM**********RRRR****RRRRRR***EEEEEEEEEEEEE***GGGGGGGGGGGGGGGG**GIII****OOOOOOOOOOOOOO****NNNN****NNNNNN***SSSSSSSSSSSSSS**
//**SSSSSSSSSSSS****SSSSSSSSSSSS****BBBBBBBBBBBBBB**BMMMM**MMMMM**MMMM**********RRRR*****RRRRR***EEEEEEEEEEEEE****GGGGGGGGGGGGGG***GIII*****OOOOOOOOOOOOO****NNNN****NNNNNN****SSSSSSSSSSSS***
//***SSSSSSSSSS******SSSSSSSSSS*****BBBBBBBBBBBBB***BMMMM**MMMMM**MMMM**********RRRR******RRRRR**EEEEEEEEEEEEE*****GGGGGGGGGGGG****GIII******OOOOOOOOOO******NNNN*****NNNNN*****SSSSSSSSSS****
//*****SSSSSS**********SSSSSS*******BBBBBBBBBBBB****BMMMM**MMMM***MMMM**********RRRR******RRRRR**EEEEEEEEEEEEE********GGGGGG*******GIII********OOOOOO********NNNN*****NNNNN******SSSSSSS******
//*******************************************************************************************************************************************************************************************/

const regionArray = [
    {
        name: `Jab during Wait`,
        color: [
            255,
            255,
            255,
            255
        ],
        quadrants: [
            false,
            true,
            true,
            false
        ],
        displayMode: 0,
        minX: 23,
        minY: 0,
        maxX: 63,
        maxY: 52,
        angleMin: 0.00,
        angleMax: 50.00,
        magnitudeMin: 0,
        magnitudeMax: 80
    },
    {
        name: `Baba Booey`,
        color: [
            255,
            255,
            255,
            255
        ],
        quadrants: [
            false,
            false,
            true,
            true
        ],
        displayMode: 0,
        minX: 55,
        minY: 44,
        maxX: 88,
        maxY: 88,
        angleMin: 0.00,
        angleMax: 90.00,
        magnitudeMin: 0,
        magnitudeMax: 80
    }
]

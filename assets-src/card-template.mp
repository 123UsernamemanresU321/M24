input twenty-four;

outputtemplate := "build/card-template-%c.mps";

% Override label drawing to keep the template blank.
def drawlabel(expr num, theta) =
enddef;

card(1, 0, 0, 0, 0);

end.

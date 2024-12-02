{
  description = "A flake for a shell with Python and specific packages";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
  };

  outputs = { self, nixpkgs }: {
    devShell.x86_64-linux = let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in pkgs.mkShell  {
      buildInputs = [
        pkgs.nodejs
      ];
      shellHook = ''
        npm i
      '';
    };
  };
}
